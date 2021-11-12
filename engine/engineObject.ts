import { ASSERT, debugAABB } from "./engineDebug";
import { abs, isOverlapping, lerp, max, randVector, sign, vec2, Vector2 } from "./engineUtilities";
import { defaultObjectSize, defaultTileSize, defaultObjectMass, defaultObjectDamping, defaultObjectAngleDamping, defaultObjectElasticity, defaultObjectFriction } from "./engineSettings";
import { time, engineObjects } from "./engine";
import { clamp } from "./engineUtilities";
import { maxObjectSpeed } from "./engineSettings";
import { gravity } from "./engineSettings";
import { engineCollideObjects } from "./engine";
import { debugPhysics } from "./engineRelease";
import { drawTile } from "./engineDraw";
import { tileCollisionTest } from "./engineTileLayer";


/*
    LittleJS Object System
*/


/** 
 *  LittleJS Object Base Object Class
 *  <br> - Base object class used by the engine
 *  <br> - Automatically adds self to object list
 *  <br> - Will be updated and rendered each frame
 *  <br> - Renders as a sprite from a tilesheet by default
 *  <br> - Can have color and addtive color applied
 *  <br> - 2d Physics and collision system
 *  <br> - Sorted by renderOrder
 *  <br> - Objects can have children attached
 *  <br> - Parents are updated before children, and set child transform
 *  <br> - Call destroy() to get rid of objects
 */

export class EngineObject
{
    additiveColor: any;
    angle: any;
    angleDamping: any;
    angleVelocity: any;
    children: any;
    collideSolidObjects: any;
    collideTiles: any;
    color: any;
    damping: any;
    destroyed: any;
    drawSize: any;
    elasticity: any;
    friction: any;
    gravityScale: any;
    groundObject: any;
    isSolid: any;
    localAngle: any;
    localPos: any;
    mass: any;
    mirror: any;
    parent: any;
    pos: any;
    renderOrder: any;
    size: any;
    spawnTime: any;
    tileIndex: any;
    tileSize: any;
    velocity: any;
    /**
     * Create an engine object and adds it to the list of objects
     * @param {Vector2} [position=new Vector2(0,0)] - World space position of the object
     * @param {Vector2} [size=defaultObjectSize] - World space size of the object
     * @param {Number}  [tileIndex=-1] - Tile to use to render object, untextured if -1
     * @param {Vector2} [tileSize=defaultTileSize] - Size of tile in source pixels
     * @param {Number}  [angle=0] - Angle to rotate the object
     * @param {Color}   [color] - Color to apply to tile when rendered
     */

    constructor(pos=vec2(), size=defaultObjectSize, tileIndex=-1, tileSize=defaultTileSize, angle=0, color: any)
    {
        // set passed in params

        ASSERT(pos && pos.x != undefined && size.x != undefined); // ensure pos and size are vec2s
        this.pos = pos.copy();
        this.size = size;
        this.tileIndex = tileIndex;
        this.tileSize = tileSize;
        this.angle = angle;
        this.color = color;

        // set physics defaults
        this.mass         = defaultObjectMass;
        this.damping      = defaultObjectDamping;
        this.angleDamping = defaultObjectAngleDamping;
        this.elasticity   = defaultObjectElasticity;
        this.friction     = defaultObjectFriction;

        // init other object stuff
        this.spawnTime = time;

        this.velocity = vec2(this.collideSolidObjects = this.renderOrder = this.angleVelocity = 0);
        this.collideTiles = this.gravityScale = 1;
        this.children = [];

        // add to list of objects
        engineObjects.push(this);
    }

    /** Update the object transform and physics, called automatically by engine once each frame */
    update()
    {
        const parent = this.parent;
        if (parent)
        {
            // copy parent pos/angle
            this.pos = this.localPos.multiply(vec2(parent.getMirrorSign(),1)).rotate(-parent.angle).add(parent.pos);
            this.angle = parent.getMirrorSign()*this.localAngle + parent.angle;
            return;
        }

        // limit max speed to prevent missing collisions
        this.velocity.x = clamp(this.velocity.x, maxObjectSpeed, -maxObjectSpeed);
        this.velocity.y = clamp(this.velocity.y, maxObjectSpeed, -maxObjectSpeed);

        // apply physics
        const oldPos = this.pos.copy();
        this.pos.x += this.velocity.x = this.damping * this.velocity.x;
        this.pos.y += this.velocity.y = this.damping * this.velocity.y + gravity * this.gravityScale;
        this.angle += this.angleVelocity *= this.angleDamping;

        // physics sanity checks

        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1);

        ASSERT(this.damping >= 0 && this.damping <= 1);

        if (!this.mass) // do not update collision for fixed objects
            return;

        const wasMovingDown = this.velocity.y < 0;
        if (this.groundObject)
        {
            // apply friction in local space of ground object
            const groundSpeed = this.groundObject.velocity ? this.groundObject.velocity.x : 0;
            this.velocity.x = groundSpeed + (this.velocity.x - groundSpeed) * this.friction;
            this.groundObject = 0;
            //debugPhysics && debugPoint(this.pos.subtract(vec2(0,this.size.y/2)), '#0f0');
        }

        if (this.collideSolidObjects)
        {
            // check collisions against solid objects
            const epsilon = 1e-3; // necessary to push slightly outside of the collision
            for (const o of engineCollideObjects)
            {
                // non solid objects don't collide with eachother

                // @ts-expect-error ts-migrate(2447) FIXME: The '&' operator is not allowed for boolean types.... Remove this comment to see the full error message
                if (!this.isSolid & !o.isSolid || o.destroyed || o.parent)
                    continue;

                // check collision
                if (!isOverlapping(this.pos, this.size, o.pos, o.size) || o == this)
                    continue;

                // pass collision to objects

                // @ts-expect-error ts-migrate(2447) FIXME: The '|' operator is not allowed for boolean types.... Remove this comment to see the full error message
                if (!this.collideWithObject(o) | !o.collideWithObject(this))
                    continue;

                if (isOverlapping(oldPos, this.size, o.pos, o.size))
                {
                    // if already was touching, try to push away
                    const deltaPos = oldPos.subtract(o.pos);
                    const length = deltaPos.length();
                    const pushAwayAccel = .001; // push away if alread overlapping
                    const velocity = length < .01 ? randVector(pushAwayAccel) : deltaPos.scale(pushAwayAccel/length);
                    this.velocity = this.velocity.add(velocity);
                    if (o.mass) // push away if not fixed
                        o.velocity = o.velocity.subtract(velocity);
                        

                    debugPhysics && debugAABB(this.pos, this.size, o.pos, o.size, '#f00');
                    continue;
                }

                // check for collision
                const sx = this.size.x + o.size.x;
                const sy = this.size.y + o.size.y;
                const smallStepUp = (oldPos.y - o.pos.y)*2 > sy + gravity; // prefer to push up if small delta
                const isBlockedX = abs(oldPos.y - o.pos.y)*2 < sy;
                const isBlockedY = abs(oldPos.x - o.pos.x)*2 < sx;
                
                if (smallStepUp || isBlockedY || !isBlockedX) // resolve y collision
                {
                    // push outside object collision
                    this.pos.y = o.pos.y + (sy/2 + epsilon) * sign(oldPos.y - o.pos.y);
                    if (o.groundObject && wasMovingDown || !o.mass)
                    {
                        // set ground object if landed on something
                        if (wasMovingDown)
                            this.groundObject = o;

                        // bounce if other object is fixed or grounded
                        this.velocity.y *= -this.elasticity;
                    }
                    else if (o.mass)
                    {
                        // inelastic collision
                        const inelastic = (this.mass * this.velocity.y + o.mass * o.velocity.y) / (this.mass + o.mass);

                        // elastic collision
                        const elastic0 = this.velocity.y * (this.mass - o.mass) / (this.mass + o.mass)
                            + o.velocity.y * 2 * o.mass / (this.mass + o.mass);
                        const elastic1 = o.velocity.y * (o.mass - this.mass) / (this.mass + o.mass)
                            + this.velocity.y * 2 * this.mass / (this.mass + o.mass);

                        // lerp betwen elastic or inelastic based on elasticity
                        const elasticity = max(this.elasticity, o.elasticity);
                        this.velocity.y = lerp(elasticity, elastic0, inelastic);
                        o.velocity.y = lerp(elasticity, elastic1, inelastic);
                    }
                    debugPhysics && smallStepUp && (abs(oldPos.x - o.pos.x)*2 > sx) && console.log('stepUp', oldPos.y - o.pos.y);
                }
                if (!smallStepUp && (isBlockedX || !isBlockedY)) // resolve x collision
                {
                    // push outside collision
                    this.pos.x = o.pos.x + (sx/2 + epsilon) * sign(oldPos.x - o.pos.x);
                    if (o.mass)
                    {
                        // inelastic collision
                        const inelastic = (this.mass * this.velocity.x + o.mass * o.velocity.x) / (this.mass + o.mass);

                        // elastic collision
                        const elastic0 = this.velocity.x * (this.mass - o.mass) / (this.mass + o.mass)
                            + o.velocity.x * 2 * o.mass / (this.mass + o.mass);
                        const elastic1 = o.velocity.x * (o.mass - this.mass) / (this.mass + o.mass)
                            + this.velocity.x * 2 * this.mass / (this.mass + o.mass);

                        // lerp betwen elastic or inelastic based on elasticity
                        const elasticity = max(this.elasticity, o.elasticity);
                        this.velocity.x = lerp(elasticity, elastic0, inelastic);
                        o.velocity.x = lerp(elasticity, elastic1, inelastic);
                    }
                    else // bounce if other object is fixed
                        this.velocity.x *= -this.elasticity;
                }


                debugPhysics && debugAABB(this.pos, this.size, o.pos, o.size, '#f0f');
            }
        }
        if (this.collideTiles)
        {
            // check collision against tiles
            if (tileCollisionTest(this.pos, this.size, this))
            {
                //debugPhysics && debugRect(this.pos, this.size, '#ff0');

                // if already was stuck in collision, don't do anything
                // this should not happen unless something starts in collision
                if (!tileCollisionTest(oldPos, this.size, this))
                {
                    // test which side we bounced off (or both if a corner)
                    const isBlockedY = tileCollisionTest(new Vector2(oldPos.x, this.pos.y), this.size, this);
                    const isBlockedX = tileCollisionTest(new Vector2(this.pos.x, oldPos.y), this.size, this);
                    if (isBlockedY || !isBlockedX)
                    {
                        // set if landed on ground
                        this.groundObject = wasMovingDown;

                        // bounce velocity
                        this.velocity.y *= -this.elasticity;

                        // adjust next velocity to settle on ground
                        const o = (oldPos.y - this.size.y/2|0) - (oldPos.y - this.size.y/2);
                        if (o < 0 && o > -1 && o > this.damping * this.velocity.y + gravity * this.gravityScale) 
                            this.velocity.y = this.damping ? (o - gravity * this.gravityScale) / this.damping : 0;

                        // move to previous position
                        this.pos.y = oldPos.y;
                    }
                    if (isBlockedX)
                    {
                        // move to previous position and bounce
                        this.pos.x = oldPos.x;
                        this.velocity.x *= -this.elasticity;
                    }
                }
            }
        }
    }

    /** Render the object, draws a tile by default, automatically called each frame, sorted by renderOrder */
    render()
    {
        // default object render
        drawTile(this.pos, this.drawSize || this.size, this.tileIndex, this.tileSize, this.color, this.angle, this.mirror, this.additiveColor);
    }

    /** Destroy this object, destroy it's children, detach it's parent, and mark it for removal */
    destroy()             
    { 
        if (this.destroyed)
            return;
        
        // disconnect from parent and destroy chidren
        this.destroyed = 1;
        this.parent && this.parent.removeChild(this);
        for (const child of this.children)
            child.destroy(child.parent = 0);
    }

    /** Called to check if a tile collision should be resolved
     *  @param {Number}  tileData - the value of the tile at the position
     *  @param {Vector2} pos - tile where the collision occured
     *  @return {Boolean} true if the collision should be resolved */
    collideWithTile(tileData: any, pos: any)        { return tileData > 0; }

    /** Called to check if a tile raycast hit
     *  @param {Number}  tileData - the value of the tile at the position
     *  @param {Vector2} pos - tile where the raycast is
     *  @return {Boolean} true if the raycast should hit */
    collideWithTileRaycast(tileData: any, pos: any) { return tileData > 0; }

    /** Called to check if a tile raycast hit
     *  @param {EngineObject} object - the object to test against
     *  @return {Boolean} true if the collision should be resolved
     */
    collideWithObject(o: any)              { return 1; }

    /** How long since the object was created
     *  @return {Number} */
    getAliveTime()                    { return time - this.spawnTime; }

    /** Apply acceleration to this object (adjust velocity, not affected by mass)
     *  @param {Vector2} acceleration */
    applyAcceleration(a: any)              { if (this.mass) this.velocity = this.velocity.add(a); }

    /** Apply force to this object (adjust velocity, affected by mass)
     *  @param {Vector2} force */
    applyForce(force: any)	              { this.applyAcceleration(force.scale(1/this.mass)); }

    /** Get the direction of the mirror
     *  @return {Number} -1 if this.mirror is true, or 1 if not mirrored */
    getMirrorSign() { return this.mirror ? -1 : 1; }

    /** Attaches a child to this with a given local transform
     *  @param {EngineObject} child
     *  @param {Vector2}      [localPos=new Vector2]
     *  @param {Number}       [localAngle=0] */

    addChild(child: any, localPos=vec2(), localAngle=0)
    {

        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
        child.localPos = localPos.copy();
        child.localAngle = localAngle;
    }

    /** Removes a child from this one
     *  @param {EngineObject} child */
    removeChild(child: any)
    {

        ASSERT(child.parent == this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = 0;
    }

    /** Set how this object collides
     *  @param {boolean} [collideSolidObjects=0] - Does it collide with solid objects
     *  @param {boolean} [isSolid=0] - Does it collide with and block other objects (expensive in large numbers)
     *  @param {boolean} [collideTiles=1] - Does it collide with the tile collision */
    setCollision(collideSolidObjects=0, isSolid=0, collideTiles=1)
    {

        ASSERT(collideSolidObjects || !isSolid); // solid objects must be set to collide

        // track collidable objects in separate list
        if (collideSolidObjects && !this.collideSolidObjects)
        {

            ASSERT(!engineCollideObjects.includes(this));
            engineCollideObjects.push(this);
        }
        else if (!collideSolidObjects && this.collideSolidObjects)
        {

            ASSERT(engineCollideObjects.includes(this))
            engineCollideObjects.splice(engineCollideObjects.indexOf(this), 1);
        }

        this.collideSolidObjects = collideSolidObjects;
        this.isSolid = isSolid;
        this.collideTiles = collideTiles;
    }
}
