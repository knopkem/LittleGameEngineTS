/** 
 *  LittleJS Drawing System
 *  <br> - Hybrid with both Canvas2D and WebGL available
 *  <br> - Super fast tile sheet rendering with WebGL
 *  <br> - Can apply rotation, mirror, color and additive color
 *  <br> - Many useful utility functions
 *  @namespace Draw
 */


/** Main tilesheet to use for batch rendering system
 *  @type {Image}
 *  @memberof Draw */
const tileImage = new Image();

/** The primary 2D canvas visible to the user
 *  @type {HTMLCanvasElement}
 *  @memberof Draw */
let mainCanvas: any;

/** 2d context for mainCanvas
 *  @type {CanvasRenderingContext2D}
 *  @memberof Draw */
let mainContext: any;

/** A canvas that appears on top of everything the same size as mainCanvas
 *  @type {HTMLCanvasElement}
 *  @memberof Draw */
let overlayCanvas: any;

/** 2d context for overlayCanvas
 *  @type {CanvasRenderingContext2D}
 *  @memberof Draw */
let overlayContext: any;

/** The size of the main canvas (and other secondary canvases: overlayCanvas and glCanvas) 
 *  @type {Vector2}
 *  @memberof Draw */

// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 0.
let mainCanvasSize = vec2();

/** Convert from screen to world space coordinates
 *  @param {Vector2} screenPos
 *  @return {Vector2}
 *  @memberof Draw */

// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
const screenToWorld = (screenPos: any) => screenPos.add(vec2(.5)).subtract(mainCanvasSize.scale(.5)).multiply(vec2(1/cameraScale,-1/cameraScale)).add(cameraPos);

/** Convert from world to screen space coordinates
 *  @param {Vector2} worldPos
 *  @return {Vector2}
 *  @memberof Draw */

// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
const worldToScreen = (worldPos: any) => worldPos.subtract(cameraPos).multiply(vec2(cameraScale,-cameraScale)).add(mainCanvasSize.scale(.5)).subtract(vec2(.5));

/** Draw textured tile centered on pos
 *  @param {Vector2} pos - Center of the tile
 *  @param {Vector2} [size=new Vector2(1,1)] - Size of the tile
 *  @param {Number}  [tileIndex=-1] - Tile index to use, negative is untextured
 *  @param {Vector2} [tileSize=defaultTileSize] - Tile size in source pixels
 *  @param {Color}   [color=new Color(1,1,1)]
 *  @param {Number}  [angle=0]
 *  @param {Boolean} [mirror=0]
 *  @param {Color}   [additiveColor=new Color(0,0,0,0)]
 *  @memberof Draw */

// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
function drawTile(pos: any, size=vec2(1), tileIndex=-1, tileSize=defaultTileSize, color=new Color, angle=0, mirror: any, 
    additiveColor=new Color(0,0,0,0))
{
    showWatermark && ++drawCount;
    if (glEnable)
    {
        if (tileIndex < 0)
        {
            // if negative tile index, force untextured
            glDraw(pos.x, pos.y, size.x, size.y, angle, 0, 0, 0, 0, 0, color.rgbaInt()); 
        }
        else
        {
            // calculate uvs and render
            const cols = tileImage.width / tileSize.x |0;

            // @ts-expect-error ts-migrate(7005) FIXME: Variable 'tileImageSizeInverse' implicitly has an ... Remove this comment to see the full error message
            const uvSizeX = tileSize.x * tileImageSizeInverse.x;

            // @ts-expect-error ts-migrate(7005) FIXME: Variable 'tileImageSizeInverse' implicitly has an ... Remove this comment to see the full error message
            const uvSizeY = tileSize.y * tileImageSizeInverse.y;
            const uvX = (tileIndex%cols)*uvSizeX, uvY = (tileIndex/cols|0)*uvSizeY;

            // shrink uvs to prevent bleeding

            // @ts-expect-error ts-migrate(7005) FIXME: Variable 'tileImageSizeInverse' implicitly has an ... Remove this comment to see the full error message
            const shrinkTilesX = tileBleedShrinkFix * tileImageSizeInverse.x;

            // @ts-expect-error ts-migrate(7005) FIXME: Variable 'tileImageSizeInverse' implicitly has an ... Remove this comment to see the full error message
            const shrinkTilesY = tileBleedShrinkFix * tileImageSizeInverse.y;
            
            glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle, 
                uvX + shrinkTilesX, uvY + shrinkTilesY, 
                uvX - shrinkTilesX + uvSizeX, uvY - shrinkTilesX + uvSizeY, 
                color.rgbaInt(), additiveColor.rgbaInt()); 
        }
    }
    else
    {
        // normal canvas 2D rendering method (slower)
        drawCanvas2D(pos, size, angle, mirror, (context: any) => {
            if (tileIndex < 0)
            {
                // if negative tile index, force untextured
                context.fillStyle = color.rgba();
                context.fillRect(-.5, -.5, 1, 1);
            }
            else
            {
                // calculate uvs and render
                const cols = tileImage.width / tileSize.x |0;
                const sX = (tileIndex%cols)*tileSize.x   + tileBleedShrinkFix;
                const sY = (tileIndex/cols|0)*tileSize.y + tileBleedShrinkFix;
                const sWidth  = tileSize.x - 2*tileBleedShrinkFix;
                const sHeight = tileSize.y - 2*tileBleedShrinkFix;
                context.globalAlpha = color.a; // only alpha is supported
                context.drawImage(tileImage, sX, sY, sWidth, sHeight, -.5, -.5, 1, 1);
            }
        });
    }
}

/** Draw colored untextured rect centered on pos
 *  @param {Vector2} pos
 *  @param {Vector2} [size=new Vector2(1,1)]
 *  @param {Color}   [color=new Color(1,1,1)]
 *  @param {Number}  [angle=0]
 *  @memberof Draw */
function drawRect(pos: any, size: any, color: any, angle: any)
{

    // @ts-expect-error ts-migrate(2554) FIXME: Expected 7-8 arguments, but got 6.
    drawTile(pos, size, -1, defaultTileSize, color, angle);
}

/** Draw textured tile centered on pos in screen space
 *  @param {Vector2} pos - Center of the tile
 *  @param {Vector2} [size=new Vector2(1,1)] - Size of the tile
 *  @param {Number}  [tileIndex=-1] - Tile index to use, negative is untextured
 *  @param {Vector2} [tileSize=defaultTileSize] - Tile size in source pixels
 *  @param {Color}   [color=new Color]
 *  @param {Number}  [angle=0]
 *  @param {Boolean} [mirror=0]
 *  @param {Color}   [additiveColor=new Color(0,0,0,0)]
 *  @memberof Draw */

// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
function drawTileScreenSpace(pos: any, size=vec2(1), tileIndex: any, tileSize: any, color: any, angle: any, mirror: any, additiveColor: any)
{
    drawTile(screenToWorld(pos), size.scale(1/cameraScale), tileIndex, tileSize, color, angle, mirror, additiveColor);
}

/** Draw colored untextured rectangle in screen space
 *  @param {Vector2} pos
 *  @param {Vector2} [size=new Vector2(1,1)]
 *  @param {Color}   [color=new Color(1,1,1)]
 *  @param {Number}  [angle=0]
 *  @memberof Draw */
function drawRectScreenSpace(pos: any, size: any, color: any, angle: any)
{

    // @ts-expect-error ts-migrate(2554) FIXME: Expected 8 arguments, but got 6.
    drawTileScreenSpace(pos, size, -1, defaultTileSize, color, angle);
}

/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {Number}  [thickness=.1]
 *  @param {Color}   [color=new Color(1,1,1)]
 *  @memberof Draw */
function drawLine(posA: any, posB: any, thickness=.1, color: any)
{
    const halfDelta = vec2((posB.x - posA.x)/2, (posB.y - posA.y)/2);
    const size = vec2(thickness, halfDelta.length()*2);
    drawRect(posA.add(halfDelta), size, color, halfDelta.angle());
}

/** Draw directly to a 2d canvas context in world space (bipass webgl)
 *  @param {Vector2}  pos
 *  @param {Vector2}  size
 *  @param {Number}   angle
 *  @param {Boolean}  mirror
 *  @param {Function} drawFunction
 *  @param {CanvasRenderingContext2D} [context=mainContext]
 *  @memberof Draw */
function drawCanvas2D(pos: any, size: any, angle: any, mirror: any, drawFunction: any, context = mainContext)
{
    // create canvas transform from world space to screen space
    pos = worldToScreen(pos);
    size = size.scale(cameraScale);
    context.save();
    context.translate(pos.x+.5|0, pos.y-.5|0);
    context.rotate(angle);
    context.scale(mirror?-size.x:size.x, size.y);
    drawFunction(context);
    context.restore();
}

/** Draw text on overlay canvas in world space
 *  @param {String}  text
 *  @param {Vector2} pos
 *  @param {Number}  [size=1]
 *  @param {Color}   [color=new Color(1,1,1)]
 *  @param {Number}  [lineWidth=0]
 *  @param {Color}   [lineColor=new Color(0,0,0)]
 *  @param {String}  [textAlign='center']
 *  @memberof Draw */
function drawText(text: any, pos: any, size=1, color=new Color, lineWidth=0, lineColor=new Color(0,0,0), textAlign='center', font=defaultFont)
{
    pos = worldToScreen(pos);
    overlayContext.font = size*cameraScale + 'px '+ font;
    overlayContext.textAlign = textAlign;
    overlayContext.textBaseline = 'middle';
    if (lineWidth)
    {
        overlayContext.lineWidth = lineWidth*cameraScale;
        overlayContext.strokeStyle = lineColor.rgba();
        overlayContext.strokeText(text, pos.x, pos.y);
    }
    overlayContext.fillStyle = color.rgba();
    overlayContext.fillText(text, pos.x, pos.y);
}

/** Enable additive or regular blend mode
 *  @param {Boolean} [additive=0]
 *  @memberof Draw */
function setBlendMode(additive: any)
{
    if (glEnable)
        glSetBlendMode(additive);
    else
        mainContext.globalCompositeOperation = additive ? 'lighter' : 'source-over';
}

///////////////////////////////////////////////////////////////////////////////
// Fullscreen mode

/** Returns true if fullscreen mode is active
 *  @return {Boolean}
 *  @memberof Draw */
const isFullscreen =()=> document.fullscreenElement;

/** Toggle fullsceen mode
 *  @memberof Draw */
function toggleFullscreen()
{
    if (isFullscreen())
    {
        if (document.exitFullscreen)
            document.exitFullscreen();
        // @ts-expect-error ts-migrate(2339) FIXME: Property 'mozCancelFullScreen' does not exist on t... Remove this comment to see the full error message
        else if (document.mozCancelFullScreen)

            // @ts-expect-error ts-migrate(2339) FIXME: Property 'mozCancelFullScreen' does not exist on t... Remove this comment to see the full error message
            document.mozCancelFullScreen();
    }
    else
    {

        // @ts-expect-error ts-migrate(2339) FIXME: Property 'webkitRequestFullScreen' does not exist ... Remove this comment to see the full error message
        if (document.body.webkitRequestFullScreen)

            // @ts-expect-error ts-migrate(2339) FIXME: Property 'webkitRequestFullScreen' does not exist ... Remove this comment to see the full error message
            document.body.webkitRequestFullScreen();
        // @ts-expect-error ts-migrate(2339) FIXME: Property 'mozRequestFullScreen' does not exist on ... Remove this comment to see the full error message
        else if (document.body.mozRequestFullScreen)

            // @ts-expect-error ts-migrate(2339) FIXME: Property 'mozRequestFullScreen' does not exist on ... Remove this comment to see the full error message
            document.body.mozRequestFullScreen();
    }
}