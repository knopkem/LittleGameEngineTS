import { fixedWidth, fixedHeight, tileBleedShrinkFix, pixelated, fixedFitToWindow, maxHeight, maxWidth } from "./engineSettings";
import { ASSERT, debugInit, debugUpdate, debugRender, debug, showWatermark } from "./engineDebug";
import { min, lerp, vec2, isOverlapping } from "./engineUtilities";
import { tileImage, mainCanvas, setMainCanvas,  mainContext, setMainContext, overlayCanvas, setOverlayCanvas, overlayContext, setOverlayContext, setMainCanvasSize } from "./engineDraw";
import { medalsRender } from "./engineMedals";
import { glInit, glPreRender } from "./engineWebGL";
import { glCanvas } from "./engineWebGL";

/*
    LittleJS - The Tiny JavaScript Game Engine That Can!
    MIT License - Copyright 2021 Frank Force

    Engine Features
    - Object oriented system with base class engine object
    - Base class object handles update, physics, collision, rendering, etc
    - Engine helper classes and functions like Vector2, Color, and Timer
    - Super fast rendering system for tile sheets
    - Sound effects audio with zzfx and music with zzfxm
    - Input processing system with gamepad and touchscreen support
    - Tile layer rendering and collision system
    - Particle effect system
    - Medal system tracks and displays achievements
    - Debug tools and debug rendering system
    - Call engineInit() to start it up!
*/


/** Name of engine */
export const engineName = 'LittleJS';

/** Version of engine */
export const engineVersion = '1.1.2';

/** Frames per second to update objects
 *  @default */
export const FPS = 60;

/** How many seconds each frame lasts, engine uses a fixed time step
 *  @default 1/60 */
export const timeDelta = 1 / FPS;

/** Array containing all engine objects */
export let engineObjects: any = [];

/** Array containing only objects that are set to collide with other objects (for optimization) */
export let engineCollideObjects: any = [];

/** Current update frame, used to calculate time */
export let frame = 0;

/** Current engine time since start in seconds, derived from frame */
export let time = 0;

/** Actual clock time since start in seconds (not affected by pause or frame rate clamping) */
export let timeReal = 0;

/** Is the game paused? Causes time and objects to not be updated. */
export let paused = 0;

// Engine internal variables not exposed to documentation
export let frameTimeLastMS = 0, frameTimeBufferMS = 0, debugFPS = 0,
    shrinkTilesX: number, shrinkTilesY: number, drawCount: any, tileImageSize: any, tileImageSizeInverse: false;

///////////////////////////////////////////////////////////////////////////////

/** Start up LittleJS engine with your callback functions
 *  @param {Function} gameInit       - Called once after the engine starts up, setup the game
 *  @param {Function} gameUpdate     - Called every frame at 60 frames per second, handle input and update the game state
 *  @param {Function} gameUpdatePost - Called after physics and objects are updated, setup camera and prepare for render
 *  @param {Function} gameRender     - Called before objects are rendered, draw any background effects that appear behind objects
 *  @param {Function} gameRenderPost - Called after objects are rendered, draw effects or hud that appear above all objects
 *  @param {String} tileImageSource  - Tile image to use, everything starts when the image is finished loading
 */

 export function engineInit(gameInit: any, gameUpdate: any, gameUpdatePost: any, gameRender: any, gameRenderPost: any, tileImageSource: any) {
    // init engine when tiles load
    tileImage.onload = () => {
        // save tile image info

        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
        tileImageSizeInverse = vec2(1).divide(tileImageSize = vec2(tileImage.width, tileImage.height));

        debug && (tileImage.onload = () => ASSERT(1)); // tile sheet can not reloaded
        shrinkTilesX = tileBleedShrinkFix / tileImageSize.x;
        shrinkTilesY = tileBleedShrinkFix / tileImageSize.y;

        // setup html
        document.body.appendChild(setMainCanvas(document.createElement('canvas')));

        // @ts-expect-error ts-migrate(2540) FIXME: Cannot assign to 'style' because it is a read-only... Remove this comment to see the full error message
        document.body.style = 'margin:0;overflow:hidden;background:#000';
        mainCanvas.style = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)' +
            (pixelated ? ';image-rendering:crisp-edges;image-rendering:pixelated' : ''); // pixelated rendering
        setMainContext(mainCanvas.getContext('2d'));

        // init stuff and start engine
        debugInit();
        glInit();

        // create overlay canvas for hud to appear above gl canvas
        document.body.appendChild(setOverlayCanvas(document.createElement('canvas')));
        overlayCanvas.style = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)';
        setOverlayContext(overlayCanvas.getContext('2d'));

        gameInit();
        engineUpdate();
    };

    // main update loop
    const engineUpdate = (frameTimeMS = 0) => {
        requestAnimationFrame(engineUpdate);

        // update time keeping
        let frameTimeDeltaMS = frameTimeMS - frameTimeLastMS;
        frameTimeLastMS = frameTimeMS;
        if (debug || showWatermark)
            debugFPS = lerp(.05, 1e3 / (frameTimeDeltaMS || 1), debugFPS);
        if (debug)
            frameTimeDeltaMS *= keyIsDown(107) ? 5 : keyIsDown(109) ? .2 : 1; // +/- to speed/slow time
        timeReal += frameTimeDeltaMS / 1e3;

        // @ts-expect-error ts-migrate(2362) FIXME: The left-hand side of an arithmetic operation must... Remove this comment to see the full error message
        frameTimeBufferMS = min(frameTimeBufferMS + !paused * frameTimeDeltaMS, 50); // clamp incase of slow framerate

        if (paused) {
            // do post update even when paused
            inputUpdate();
            debugUpdate();
            gameUpdatePost();
            inputUpdatePost();
        }
        else {
            // apply time delta smoothing, improves smoothness of framerate in some browsers
            let deltaSmooth = 0;
            if (frameTimeBufferMS < 0 && frameTimeBufferMS > -9) {
                // force an update each frame if time is close enough (not just a fast refresh rate)
                deltaSmooth = frameTimeBufferMS;
                frameTimeBufferMS = 0;
            }

            // update multiple frames if necessary in case of slow framerate
            for (; frameTimeBufferMS >= 0; frameTimeBufferMS -= 1e3 / FPS) {
                // update game and objects
                inputUpdate();
                gameUpdate();
                engineObjectsUpdate();

                // do post update
                debugUpdate();
                gameUpdatePost();
                inputUpdatePost();
            }

            // add the time smoothing back in
            frameTimeBufferMS += deltaSmooth;
        }

        if (fixedWidth) {
            // clear set fixed size
            mainCanvas.width = fixedWidth;
            mainCanvas.height = fixedHeight;

            if (fixedFitToWindow) {
                // fit to window by adding space on top or bottom if necessary
                const aspect = innerWidth / innerHeight;
                const fixedAspect = fixedWidth / fixedHeight;
                mainCanvas.style.width = overlayCanvas.style.width = aspect < fixedAspect ? '100%' : '';
                mainCanvas.style.height = overlayCanvas.style.height = aspect < fixedAspect ? '' : '100%';
                if (glCanvas) {
                    glCanvas.style.width = mainCanvas.style.width;
                    glCanvas.style.height = mainCanvas.style.height;
                }
            }
        }
        else {
            // clear and set size to same as window
            mainCanvas.width = min(innerWidth, maxWidth);
            mainCanvas.height = min(innerHeight, maxHeight);
        }

        // save canvas size and clear overlay canvas
        setMainCanvasSize(vec2(overlayCanvas.width = mainCanvas.width, overlayCanvas.height = mainCanvas.height));
        mainContext.imageSmoothingEnabled = !pixelated; // disable smoothing for pixel art

        // render sort then render while removing destroyed objects
        glPreRender(mainCanvas.width, mainCanvas.height);
        gameRender();

        // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        engineObjects.sort((a, b) => a.renderOrder - b.renderOrder);
        for (const o of engineObjects)
            o.destroyed || o.render();
        gameRenderPost();
        medalsRender();
        debugRender();

        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
        glCopyToContext(mainContext);

        if (showWatermark) {
            // update fps
            overlayContext.textAlign = 'right';
            overlayContext.textBaseline = 'top';
            overlayContext.font = '1em monospace';
            overlayContext.fillStyle = '#000';
            const text = engineName + ' ' + 'v' + engineVersion + ' / '
                + drawCount + ' / ' + engineObjects.length + ' / ' + debugFPS.toFixed(1);
            overlayContext.fillText(text, mainCanvas.width - 3, 3);
            overlayContext.fillStyle = '#fff';
            overlayContext.fillText(text, mainCanvas.width - 2, 2);
            drawCount = 0;
        }
    }

    // set tile image source to load the image and start the engine

    // @ts-expect-error ts-migrate(2554) FIXME: Expected 1 arguments, but got 0.
    tileImageSource ? tileImage.src = tileImageSource : tileImage.onload();
}


///////////////////////////////////////////////////////////////////////////////

/** Calls update on each engine object (recursively if child), removes destroyed objects, and updated time */

export function engineObjectsUpdate() {
    // recursive object update
    const updateObject = (o: any) => {
        if (!o.destroyed) {
            o.update();
            for (const child of o.children)
                updateObject(child);
        }
    }
    for (const o of engineObjects)
        o.parent || updateObject(o);

    // remove destroyed objects

    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'o' implicitly has an 'any' type.
    engineObjects = engineObjects.filter(o => !o.destroyed);

    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'o' implicitly has an 'any' type.
    engineCollideObjects = engineCollideObjects.filter(o => !o.destroyed);

    // increment frame and update time
    time = ++frame / FPS;
}

/** Detroy and remove all objects that are not persistent or descendants of a persistent object */

export function engineObjectsDestroy() {
    for (const o of engineObjects)
        o.persistent || o.parent || o.destroy();

    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'o' implicitly has an 'any' type.
    engineObjects = engineObjects.filter(o => !o.destroyed);
}

/** Triggers a callback for each object within a given area
 *  @param {Vector2} [pos] - Center of test area
 *  @param {Number} [size] - Radius of circle if float, rectangle size if Vector2
 *  @param {Function} [callbackFunction] - Calls this function on every object that passes the test
 *  @param {Array} [objects=engineObjects] - List of objects to check */


 export function engineObjectsCallback(pos: any, size: any, callbackFunction: any, objects = engineObjects) {
    if (!pos) {
        // all objects
        for (const o of objects)
            callbackFunction(o);
    }
    else if (size.x != undefined) {
        // aabb test
        for (const o of objects)
            isOverlapping(pos, size, o.pos, o.size) && callbackFunction(o);
    }
    else {
        // circle test
        const sizeSquared = size * size;
        for (const o of objects)
            pos.distanceSquared(o.pos) < sizeSquared && callbackFunction(o);
    }
}

function keyIsDown(arg0: number) {
    throw new Error("Function not implemented.");
    return false;
}


function inputUpdate() {
    throw new Error("Function not implemented.");
    return false;
}


function inputUpdatePost() {
    throw new Error("Function not implemented.");
    return false;
}
