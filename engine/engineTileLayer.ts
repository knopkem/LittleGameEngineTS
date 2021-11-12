import { debugLine, ASSERT } from './engineDebug';
import { mainContext, worldToScreen, mainCanvasSize, mainCanvas, drawTile, tileImage } from './engineDraw';
import { EngineObject } from './engineObject';
import { debugRaycast } from './engineRelease';
import { defaultTileSize, cameraScale, cameraPos, pixelated } from './engineSettings';
import { abs, Color, max, min, PI, sign, vec2, Vector2 } from './engineUtilities';
import { glPreRender, glCopyToContext } from './engineWebGL';

/** 
 *  LittleJS Tile Layer System
 *  <br> - Caches arrays of tiles to offscreen canvas for fast rendering
 *  <br> - Unlimted numbers of layers, allocates canvases as needed
 *  <br> - Interfaces with EngineObject for collision
 *  <br> - Collision layer is separate from visible layers
 *  <br> - Tile layers can be drawn to using their context with canvas2d
 *  <br> - It is recommended to have a visible layer that matches the collision
 *  @namespace TileLayer
 */

///////////////////////////////////////////////////////////////////////////////
// Tile Collision

// Internal variables not exposed to documentation

let tileCollision: Array<any> = [], tileCollisionSize = vec2();

/** Clear and initialize tile collision
 *  @param {Vector2} size
 *  @memberof TileLayer */
 export function initTileCollision(size: any)
{
    tileCollisionSize = size;
    tileCollision = [];
    for (let i=tileCollision.length = tileCollisionSize.area(); i--;)
        tileCollision[i] = 0;
}

/** Set tile collision data
 *  @param {Vector2} pos
 *  @param {Number}  [data=0]
 *  @memberof TileLayer */

 export const setTileCollisionData = (pos: any, data=0)=>
    pos.arrayCheck(tileCollisionSize) && (tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] = data);

/** Get tile collision data
 *  @param {Vector2} pos
 *  @return {Number}
 *  @memberof TileLayer */

 export const getTileCollisionData = (pos: any) => pos.arrayCheck(tileCollisionSize) ? tileCollision[(pos.y|0)*tileCollisionSize.x+pos.x|0] : 0;

/** Check if collision with another object should occur
 *  @param {Vector2}      pos
 *  @param {Vector2}      [size=new Vector2(1,1)]
 *  @param {EngineObject} [object]
 *  @return {Boolean}
 *  @memberof TileLayer */

 export function tileCollisionTest(pos: any, size=vec2(), object: any)
{
    const minX = max(Math.floor(pos.x - size.x/2), 0);
    const minY = max(Math.floor(pos.y - size.y/2), 0);
    const maxX = min(pos.x + size.x/2, tileCollisionSize.x-1);
    const maxY = min(pos.y + size.y/2, tileCollisionSize.y-1);
    for (let y = minY; y < maxY; ++y)
    for (let x = minX; x < maxX; ++x)
    {
        const tileData = tileCollision[y*tileCollisionSize.x+x];
        if (tileData && (!object || object.collideWithTile(tileData, new Vector2(x, y))))
            return 1;
    }
}

/** Return the center of tile if any that is hit (this does not return the exact hit point)
 *  @param {Vector2}      posStart
 *  @param {Vector2}      posEnd
 *  @param {EngineObject} [object]
 *  @return {Vector2}
 *  @memberof TileLayer */
 export function tileCollisionRaycast(posStart: any, posEnd: any, object: any)
{
    // test if a ray collides with tiles from start to end
    // todo: a way to get the exact hit point, it must still register as inside the hit tile
    posStart = posStart.floor();
    posEnd = posEnd.floor();
    const posDelta = posEnd.subtract(posStart);
    const dx = abs(posDelta.x),  dy = -abs(posDelta.y);
    const sx = sign(posDelta.x), sy = sign(posDelta.y);
    let e = dx + dy;

    for (let x = posStart.x, y = posStart.y;;)
    {
        const tileData = getTileCollisionData(vec2(x,y));
        if (tileData && (object ? object.collideWithTileRaycast(tileData, new Vector2(x, y)) : tileData > 0))
        {

            debugRaycast && debugLine(posStart, posEnd, '#f00',.02, 1);

            // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 3.
            debugRaycast && debugPoint(new Vector2(x+.5, y+.5), '#ff0', 1);
            return new Vector2(x+.5, y+.5);
        }

        // update Bresenham line drawing algorithm

        // @ts-expect-error ts-migrate(2447) FIXME: The '&' operator is not allowed for boolean types.... Remove this comment to see the full error message
        if (x == posEnd.x & y == posEnd.y) break;
        const e2 = 2*e;
        if (e2 >= dy) e += dy, x += sx;
        if (e2 <= dx) e += dx, y += sy;
    }

    debugRaycast && debugLine(posStart, posEnd, '#00f',.02, 1);
}

///////////////////////////////////////////////////////////////////////////////
// Tile Layer Rendering System

// Reuse canvas autmatically when destroyed

export const tileLayerCanvasCache: Array<any> = [];

/** Tile layer data object stores info about how to render a tile */

export class TileLayerData
{
    color: any;
    direction: any;
    mirror: any;
    tile: any;
    /** Create a tile layer data object
     *  @param {Number}  [tile] - The tile to use, untextured if undefined
     *  @param {Number}  [direction=0] - Integer direction of tile, in 90 degree increments
     *  @param {Boolean} [mirror=0] - If the tile should be mirrored along the x axis
     *  @param {Color}   [color=new Color(1,1,1)] - Color of the tile
     */
    constructor(tile: any, direction=0, mirror=0, color=new Color)
    {
        this.tile      = tile;
        this.direction = direction;
        this.mirror    = mirror;
        this.color     = color;
    }

    /** Set this tile to clear, it will not be rendered */

    // @ts-expect-error ts-migrate(2663) FIXME: Cannot find name 'color'. Did you mean the instanc... Remove this comment to see the full error message
    clear() { this.tile = this.direction = this.mirror = 0; color = new Color; }
}

/** Tile layer object - cached rendering system for tile layers */

export class TileLayer extends EngineObject
{
    canvas: any;
    context: any;
    data: any;
    flushGLBeforeRender: any;
    savedRenderSettings: any;
    scale: any;
    /** Create a tile layer data object
     *  @param {Vector2} [position=new Vector2(0,0)] - World space position
     *  @param {Vector2} [size=defaultObjectSize] - World space size
     *  @param {Vector2} [scale=new Vector2(1,1)] - How much to scale this in world space
     *  @param {Number}  [renderOrder=0] - Objects sorted by renderOrder before being rendered
     */

    constructor(pos: any, size: any, scale=vec2(1), renderOrder=0)
    {

        // @ts-expect-error ts-migrate(2554) FIXME: Expected 6 arguments, but got 2.
        super(pos, size);

        // create new canvas if necessary
        this.canvas = tileLayerCanvasCache.length ? tileLayerCanvasCache.pop() : document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
        this.scale = scale;
        this.tileSize = defaultTileSize.copy();
        this.renderOrder = renderOrder;
        this.flushGLBeforeRender = 1;

        // init tile data
        this.data = [];
        for (let j = this.size.area(); j--;)

            // @ts-expect-error ts-migrate(2554) FIXME: Expected 1-4 arguments, but got 0.
            this.data.push(new TileLayerData());
    }

    /** Destroy this tile layer */
    destroy()
    {
        // add canvas back to the cache
        tileLayerCanvasCache.push(this.canvas);
        super.destroy();
    }

    /** Set data at a given position in the array 
     *  @param {Vector2}       position - Local position in array
     *  @param {TileLayerData} data - Data to set
     *  @param {Boolean}       [redraw=0] - Force the tile to redraw if true */
    setData(layerPos: any, data: any, redraw: any)
    {
        if (layerPos.arrayCheck(this.size))
        {
            this.data[(layerPos.y|0)*this.size.x+layerPos.x|0] = data;
            redraw && this.drawTileData(layerPos);
        }
    }

    /** Get data at a given position in the array 
     *  @param {Vector2} layerPos - Local position in array
     *  @return {TileLayerData} */
    getData(layerPos: any)
    { return layerPos.arrayCheck(this.size) && this.data[(layerPos.y|0)*this.size.x+layerPos.x|0]; }

    // Tile layers are not updated
    update() {}

    // Render the tile layer, called automatically by the engine
    render()
    {

        ASSERT(mainContext != this.context); // must call redrawEnd() after drawing tiles

        // flush and copy gl canvas because tile canvas does not use gl

        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
        this.flushGLBeforeRender && glEnable && glCopyToContext(mainContext);
        
        // draw the entire cached level onto the main canvas
        const pos = worldToScreen(this.pos.add(vec2(0,this.size.y*this.scale.y)));
        mainContext.drawImage
        (
            this.canvas, pos.x, pos.y,
            cameraScale*this.size.x*this.scale.x, cameraScale*this.size.y*this.scale.y
        );
    }

    /** Draw all the tile data to an offscreen canvas using webgl if possible */
    redraw()
    {
        this.redrawStart();
        this.drawAllTileData();
        this.redrawEnd();
    }

    /** Call to start the redraw process
     *  @param {Boolean} [clear=1] - Should it clear the canvas before drawing */
    redrawStart(clear = 1)
    {
        // clear and set size
        const width  = this.size.x * this.tileSize.x;
        const height = this.size.y * this.tileSize.y;
        if (clear)
        {
            this.canvas.width  = width;
            this.canvas.height = height;
        }

        // save current render settings
        this.savedRenderSettings = [mainCanvasSize, mainCanvas, mainContext, cameraScale, cameraPos];

        // set camera transform for renering
        cameraScale = this.tileSize.x;
        cameraPos = this.size.scale(.5);
        mainCanvas = this.canvas;
        mainContext = this.context;
        mainContext.imageSmoothingEnabled = !pixelated; // disable smoothing for pixel art
        mainCanvasSize = vec2(width, height);
        glPreRender(width, height);
    }

    /** Call to end the redraw process */
    redrawEnd()
    {

        ASSERT(mainContext == this.context); // must call redrawStart() before drawing tiles
        glCopyToContext(mainContext, 1);
        //debugSaveCanvas(this.canvas);

        // set stuff back to normal
        [mainCanvasSize, mainCanvas, mainContext, cameraScale, cameraPos] = this.savedRenderSettings;
    }

    /** Draw the tile at a given position
     *  @param {Vector2} layerPos */
    drawTileData(layerPos: any)
    {
        // first clear out where the tile was

        const pos = layerPos.floor().add(this.pos).add(vec2(.5));

        this.drawCanvas2D(pos, vec2(1), 0, 0, (context: any) => context.clearRect(-.5, -.5, 1, 1));

        // draw the tile if not undefined
        const d = this.getData(layerPos);
        if (d.tile != undefined)
        {

            ASSERT(mainContext == this.context); // must call redrawStart() before drawing tiles

            drawTile(pos, vec2(1), d.tile, this.tileSize, d.color, d.direction*PI/2, d.mirror);
        }
    }

    /** Draw all the tiles in this layer */
    drawAllTileData()
    {
        for (let x = this.size.x; x--;)
        for (let y = this.size.y; y--;)
             this.drawTileData(vec2(x,y));
    }

    /** Draw directly to the 2d canvas in world space (bipass webgl)
     *  @param {Vector2}  pos
     *  @param {Vector2}  size
     *  @param {Number}   angle
     *  @param {Boolean}  mirror
     *  @param {Function} drawFunction */
    drawCanvas2D(pos: any, size: any, angle: any, mirror: any, drawFunction: any)
    {
        const context = this.context;
        context.save();
        pos = pos.subtract(this.pos).multiply(this.tileSize);
        size = size.multiply(this.tileSize);
        context.translate(pos.x, this.canvas.height - pos.y);
        context.rotate(angle);
        context.scale(mirror?-size.x:size.x, size.y);
        drawFunction(context);
        context.restore();
    }

    /** Draw a tile directly onto the layer canvas
     *  @param {Vector2} pos
     *  @param {Vector2} [size=new Vector2(1,1)]
     *  @param {Number}  [tileIndex=-1]
     *  @param {Vector2} [tileSize=defaultTileSize]
     *  @param {Color}   [color=new Color(1,1,1)]
     *  @param {Number}  [angle=0]
     *  @param {Boolean} [mirror=0] */

    drawTile(pos: any, size=vec2(1), tileIndex=-1, tileSize=defaultTileSize, color=new Color, angle=0, mirror: any)
    {
        this.drawCanvas2D(pos, size, angle, mirror, (context: any) => {
            if (tileIndex < 0)
            {
                // untextured
                context.fillStyle = color.rgba();
                context.fillRect(-.5, -.5, 1, 1);
            }
            else
            {
                const cols = tileImage.width/tileSize.x;
                context.globalAlpha = color.a; // full color not supported in this mode
                context.drawImage(tileImage, 
                    (tileIndex%cols)*tileSize.x, (tileIndex/cols|0)*tileSize.x, 
                    tileSize.x, tileSize.y, -.5, -.5, 1, 1);
            }
        });
    }

    /** Draw a rectangle directly onto the layer canvas
     *  @param {Vector2} pos
     *  @param {Vector2} [size=new Vector2(1,1)]
     *  @param {Color}   [color=new Color(1,1,1)]
     *  @param {Number}  [angle=0] */

    drawRect(pos: any, size: any, color: any, angle: any) { this.drawTile(pos, size, -1, undefined, color, angle, 0); }
}