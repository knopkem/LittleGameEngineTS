/*
    LittleJS Particle System
    - Spawns particles with randomness from parameters
    - Updates particle physics
    - Fast particle rendering
*/

import { timeDelta, time } from "./index";
import { debugRect } from "./index";
import { setBlendMode, drawTile } from "./index";
import { EngineObject } from "./index";
import { debugParticles } from "./index";
import { defaultTileSize } from "./index";
import { PI, Color, vec2, Vector2, rand, randInCircle, randSign, randColor, min, max } from "./index";

/**
 * Particle Emitter - Spawns particles with the given settings
 */

export class ParticleEmitter extends EngineObject
{
    additive: any;
    angleSpeed: any;
    colorEndA: any;
    colorEndB: any;
    colorStartA: any;
    colorStartB: any;
    emitConeAngle: any;
    emitRate: any;
    emitSize: any;
    emitTime: any;
    emitTimeBuffer: any;
    fadeRate: any;
    particleConeAngle: any;
    particleCreateCallback: any;
    particleDestroyCallback: any;
    particleTime: any;
    randomColorLinear: any;
    randomness: any;
    sizeEnd: any;
    sizeStart: any;
    speed: any;
    trailScale: any;
    /**
     * Create a particle system with the given settings
     * @param {Vector2} position          - World space position of the emitter
     * @param {Number}  [emitSize=0]       - World space size of the emitter (float for circle diameter, vec2 for rect)
     * @param {Number}  [emitTime=0]       - How long to stay alive (0 is forever)
     * @param {Number}  [emitRate=100]     - How many particles per second to spawn
     * @param {Number}  [emitConeAngle=PI] - Local angle to apply velocity to particles from emitter
     * @param {Number}  [tileIndex=-1]     - Index into tile sheet, if <0 no texture is applied
     * @param {Number}  [tileSize=defaultTileSize]    - Tile size for particles
     * @param {Color}   [colorStartA=new Color(1,1,1)] - Color at start of life 1, randomized between start colors
     * @param {Color}   [colorStartB=new Color(1,1,1)] - Color at start of life 2, randomized between start colors
     * @param {Color}   [colorEndA=new Color(1,1,1,0)] - Color at end of life 1, randomized between end colors
     * @param {Color}   [colorEndB=new Color(1,1,1,0)] - Color at end of life 2, randomized between end colors
     * @param {Number}  [particleTime=.5]      - How long particles live
     * @param {Number}  [sizeStart=.1]         - How big are particles at start
     * @param {Number}  [sizeEnd=1]            - How big are particles at end
     * @param {Number}  [speed=.1]             - How fast are particles when spawned
     * @param {Number}  [angleSpeed=.05]       - How fast are particles rotating
     * @param {Number}  [damping=1]            - How much to dampen particle speed
     * @param {Number}  [angleDamping=1]       - How much to dampen particle angular speed
     * @param {Number}  [gravityScale=0]       - How much does gravity effect particles
     * @param {Number}  [particleConeAngle=PI] - Cone for start particle angle
     * @param {Number}  [fadeRate=.1]          - How quick to fade in particles at start/end in percent of life
     * @param {Number}  [randomness=.2]        - Apply extra randomness percent
     * @param {Boolean} [collideTiles=0]      - Do particles collide against tiles
     * @param {Boolean} [additive=0]          - Should particles use addtive blend
     * @param {Boolean} [randomColorLinear=0] - Should color be randomized linearly or across each component
     * @param {Number}  [renderOrder=0]        - Render order for particles (additive is above other stuff by default)
     */
    constructor
    ( 
        pos: any,
        emitSize = 0,
        emitTime = 0,
        emitRate = 100,
        emitConeAngle = PI,
        tileIndex = -1,
        tileSize = defaultTileSize,
        colorStartA = new Color,
        colorStartB = new Color,
        colorEndA = new Color(1,1,1,0),
        colorEndB = new Color(1,1,1,0),
        particleTime = .5,
        sizeStart = .1,
        sizeEnd = 1,
        speed = .1,
        angleSpeed = .05,
        damping = 1,
        angleDamping = 1,
        gravityScale = 0,
        particleConeAngle = PI,
        fadeRate = .1,
        randomness = .2, 
        collideTiles: any,
        additive: any,
        randomColorLinear = 1,
        renderOrder = additive ? 1e9 : 0
    )
    {

        // @ts-expect-error ts-migrate(2554) FIXME: Expected 6 arguments, but got 4.
        super(pos, new Vector2, tileIndex, tileSize);

        // emitter settings
        this.emitSize = emitSize
        this.emitTime = emitTime;
        this.emitRate = emitRate;
        this.emitConeAngle = emitConeAngle;

        // color settings
        this.colorStartA = colorStartA;
        this.colorStartB = colorStartB;
        this.colorEndA   = colorEndA;
        this.colorEndB   = colorEndB;
        this.randomColorLinear = randomColorLinear;

        // particle settings
        this.particleTime      = particleTime;
        this.sizeStart         = sizeStart;
        this.sizeEnd           = sizeEnd;
        this.speed             = speed;
        this.angleSpeed        = angleSpeed;
        this.damping           = damping;
        this.angleDamping      = angleDamping;
        this.gravityScale      = gravityScale;
        this.particleConeAngle = particleConeAngle;
        this.fadeRate          = fadeRate;
        this.randomness        = randomness;
        this.collideTiles      = collideTiles;
        this.additive          = additive;
        this.renderOrder       = renderOrder;
        this.trailScale        =  
        this.emitTimeBuffer    = 0;
    }

    /** Update the emitter to spawn particles, called automatically by engine once each frame */
    update()
    {
        // only do default update to apply parent transforms
        this.parent && super.update();

        // update emitter
        if (!this.emitTime || this.getAliveTime() <= this.emitTime)
        {
            // emit particles
            if (this.emitRate)
            {
                const rate = 1/this.emitRate;
                for (this.emitTimeBuffer += timeDelta; this.emitTimeBuffer > 0; this.emitTimeBuffer -= rate)
                    this.emitParticle();
            }
        }
        else
            this.destroy();


        debugParticles && debugRect(this.pos, vec2(this.emitSize), '#0f0', 0, this.angle);
    }

    /** Spawn one particle
     *  @return {Particle} */
    emitParticle()
    {
        // spawn a particle
        const pos = this.emitSize.x != undefined ? // check if vec2 was used for size
            (new Vector2(rand(-.5,.5), rand(-.5,.5))).multiply(this.emitSize).rotate(this.angle) // box emitter
            : randInCircle(this.emitSize * .5);                                                  // circle emitter
        const particle = new Particle(this.pos.add(pos), this.tileIndex, this.tileSize, 
            this.angle + rand(this.particleConeAngle, -this.particleConeAngle));

        // randomness scales each paremeter by a percentage
        const randomness = this.randomness;
        const randomizeScale = (v: any) => v + v*rand(randomness, -randomness);

        // randomize particle settings
        const particleTime  = randomizeScale(this.particleTime);
        const sizeStart     = randomizeScale(this.sizeStart);
        const sizeEnd       = randomizeScale(this.sizeEnd);
        const speed         = randomizeScale(this.speed);
        const angleSpeed    = randomizeScale(this.angleSpeed) * randSign();
        const coneAngle     = rand(this.emitConeAngle, -this.emitConeAngle);
        const colorStart    = randColor(this.colorStartA, this.colorStartB, this.randomColorLinear);
        const colorEnd      = randColor(this.colorEndA,   this.colorEndB, this.randomColorLinear);

        // build particle settings
        particle.colorStart      = colorStart;
        particle.colorEndDelta   = colorEnd.subtract(colorStart);
        particle.velocity        = (new Vector2).setAngle(this.angle + coneAngle, speed);
        particle.angleVelocity   = angleSpeed;
        particle.lifeTime        = particleTime;
        particle.sizeStart       = sizeStart;
        particle.sizeEndDelta    = sizeEnd - sizeStart;
        particle.fadeRate        = this.fadeRate;
        particle.damping         = this.damping;
        particle.angleDamping    = this.angleDamping;
        particle.elasticity      = this.elasticity;
        particle.friction        = this.friction;
        particle.gravityScale    = this.gravityScale;
        particle.collideTiles    = this.collideTiles;
        particle.additive        = this.additive;
        particle.renderOrder     = this.renderOrder;
        particle.trailScale      = this.trailScale;
        particle.mirror          = rand()<.5;

        // setup callbacks for particles
        particle.destroyCallback = this.particleDestroyCallback;
        this.particleCreateCallback && this.particleCreateCallback(particle);

        // return the newly created particle
        return particle;
    }

    // Particle emitters are not rendered, only the particles are
    render() {}
}

///////////////////////////////////////////////////////////////////////////////
/**
 * Particle Object - Created automatically by Particle Emitters
 */

class Particle extends EngineObject
{
    additive: any;
    colorEndDelta: any;
    colorStart: any;
    destroyCallback: any;
    fadeRate: any;
    lifeTime: any;
    sizeEndDelta: any;
    sizeStart: any;
    trailScale: any;
    /**
     * Create a particle with the given settings
     * @param {Vector2} position                   - World space position of the particle
     * @param {Number}  [tileIndex=-1]              - Tile to use to render, untextured if -1
     * @param {Vector2} [tileSize=defaultTileSize] - Size of tile in source pixels
     * @param {Number}  [angle=0]                   - Angle to rotate the particle
     */

    // @ts-expect-error ts-migrate(2554) FIXME: Expected 6 arguments, but got 5.
    constructor(pos: any, tileIndex: any, tileSize: any, angle: any) { super(pos, new Vector2, tileIndex, tileSize, angle); }

    /** Render the particle, automatically called each frame, sorted by renderOrder */
    render()
    {
        // modulate size and color
        const p = min((time - this.spawnTime) / this.lifeTime, 1);
        const radius = this.sizeStart + p * this.sizeEndDelta;
        const size = new Vector2(radius, radius);
        const fadeRate = this.fadeRate/2;
        const color = new Color(
            this.colorStart.r + p * this.colorEndDelta.r,
            this.colorStart.g + p * this.colorEndDelta.g,
            this.colorStart.b + p * this.colorEndDelta.b,
            (this.colorStart.a + p * this.colorEndDelta.a) * 
             (p < fadeRate ? p/fadeRate : p > 1-fadeRate ? (1-p)/fadeRate : 1)); // fade alpha

        // draw the particle
        this.additive && setBlendMode(1);
        if (this.trailScale)
        {
            // trail style particles
            const speed = this.velocity.length();
            const direction = this.velocity.scale(1/speed);
            const trailLength = speed * this.trailScale;
            size.y = max(size.x, trailLength);
            this.angle = direction.angle();
            drawTile(this.pos.add(direction.multiply(vec2(0,-trailLength/2))), size, this.tileIndex, this.tileSize, color, this.angle, this.mirror);
        }
        else
            drawTile(this.pos, size, this.tileIndex, this.tileSize, color, this.angle, this.mirror);

        // @ts-expect-error ts-migrate(2554) FIXME: Expected 1 arguments, but got 0.
        this.additive && setBlendMode();

        debugParticles && debugRect(this.pos, size, '#f005', 0, this.angle);

        if (p == 1)
        {
            // destroy particle when it's time runs out
            this.color = color;
            this.size = size;
            this.destroyCallback && this.destroyCallback(this);
            this.destroyed = 1;
        }
    }
}