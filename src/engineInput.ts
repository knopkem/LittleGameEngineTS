import { mainCanvas } from "./index";
import { sign, vec2, percent } from "./index";
import { screenToWorld, mainCanvasSize } from "./index";
import { debug } from "./index";
import { touchInputEnable, gamepadsEnable, copyWASDToDpad, copyGamepadDirectionToStick } from "./index";
import { zzfx } from "./index";

/** 
 *  LittleJS Input System
 *  <br> - Tracks key down, pressed, and released
 *  <br> - Also tracks mouse buttons, position, and wheel
 *  <br> - Supports multiple gamepads
 *  @namespace Input
 */



/** Returns true if device key is down
 *  @param {Number} key
 *  @param {Number} [device=0]
 *  @return {Boolean}
 *  @memberof Input */
export const keyIsDown = (key: any, device=0)=> inputData[device] && inputData[device][key] & 1 ? 1 : 0;

/** Returns true if device key was pressed this frame
 *  @param {Number} key
 *  @param {Number} [device=0]
 *  @return {Boolean}
 *  @memberof Input */
 export const keyWasPressed = (key: any, device=0)=> inputData[device] && inputData[device][key] & 2 ? 1 : 0;

/** Returns true if device key was released this frame
 *  @param {Number} key
 *  @param {Number} [device=0]
 *  @return {Boolean}
 *  @memberof Input */
 export const keyWasReleased = (key: any, device=0)=> inputData[device] && inputData[device][key] & 4 ? 1 : 0;

/** Clears all input
 *  @memberof Input */
 export const clearInput = (): any => inputData[0] = [];

/** Returns true if mouse button is down
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
 export const mouseIsDown = keyIsDown;

/** Returns true if mouse button was pressed
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
 export const mouseWasPressed = keyWasPressed;

/** Returns true if mouse button was released
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
 export const mouseWasReleased = keyWasReleased;

/** Mouse pos in world space
 *  @type {Vector2}
 *  @memberof Input */

 export let mousePos = vec2();

/** Mouse pos in screen space
 *  @type {Vector2}
 *  @memberof Input */

 export let mousePosScreen = vec2();

/** Mouse wheel delta this frame
 *  @memberof Input */
 export let mouseWheel = 0;

/** Returns true if user is using gamepad (has more recently pressed a gamepad button)
 *  @memberof Input */
 export let usingGamepad = 0;

/** Returns true if gamepad button is down
 *  @param {Number} button
 *  @param {Number} [gamepad=0]
 *  @return {Boolean}
 *  @memberof Input */
 export const gamepadIsDown = (button: any, gamepad=0)=> keyIsDown(button, gamepad+1);

/** Returns true if gamepad button was pressed
 *  @param {Number} button
 *  @param {Number} [gamepad=0]
 *  @return {Boolean}
 *  @memberof Input */
 export const gamepadWasPressed = (button: any, gamepad=0)=> keyWasPressed(button, gamepad+1);

/** Returns true if gamepad button was released
 *  @param {Number} button
 *  @param {Number} [gamepad=0]
 *  @return {Boolean}
 *  @memberof Input */
 export const gamepadWasReleased = (button: any, gamepad=0)=> keyWasReleased(button, gamepad+1);

/** Returns gamepad stick value
 *  @param {Number} stick
 *  @param {Number} [gamepad=0]
 *  @return {Vector2}
 *  @memberof Input */

 export const gamepadStick = (stick: any,  gamepad=0)=> stickData[gamepad] ? stickData[gamepad][stick] || vec2() : vec2();

///////////////////////////////////////////////////////////////////////////////
// Input update called by engine

const inputData: any = [[]];

export function inputUpdate()
{
    // clear input when lost focus (prevent stuck keys)
    document.hasFocus() || clearInput();

    // update mouse world space position
    mousePos = screenToWorld(mousePosScreen);
    console.log('new pos', mousePos);
    // update gamepads if enabled
    gamepadsUpdate();
}

export function inputUpdatePost()
{
    // clear input to prepare for next frame
    for (const deviceInputData of inputData)
    for (const i in deviceInputData)

        deviceInputData[i] &= 1;
    mouseWheel = 0;
}

///////////////////////////////////////////////////////////////////////////////
// Keyboard event handlers

onkeydown = e=>
{
    if (debug && e.target != document.body) return;

    e.repeat || (inputData[usingGamepad = 0][remapKeyCode(e.keyCode)] = 3);
    debug || e.preventDefault();
}
onkeyup = e=>
{
    if (debug && e.target != document.body) return;

    inputData[0][remapKeyCode(e.keyCode)] = 4;
}
const remapKeyCode = (c: any) => copyWASDToDpad ? c==87?38 : c==83?40 : c==65?37 : c==68?39 : c : c;

///////////////////////////////////////////////////////////////////////////////
// Mouse event handlers


// @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'never'.
onmousedown = e=> {inputData[usingGamepad = 0][e.button] = 3; onmousemove(e); e.button && e.preventDefault();}

// // @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'never'.
onmouseup   = e=> inputData[0][e.button] = inputData[0][e.button] & 2 | 4;
onmousemove = e=>
{
    // convert mouse pos to canvas space
    const canvas  = mainCanvas;
    if (!canvas) {
      console.error('no canvas');
      return;
    }
    const rect = canvas.getBoundingClientRect();
    mousePosScreen.x = mainCanvasSize.x * percent(e.x, rect.right, rect.left);
    mousePosScreen.y = mainCanvasSize.y * percent(e.y, rect.bottom, rect.top);
}
onwheel = e=> e.ctrlKey || (mouseWheel = sign(e.deltaY));
oncontextmenu = _e=> !1; // prevent right click menu

///////////////////////////////////////////////////////////////////////////////
// Gamepad input

export const stickData:  any = [];
export function gamepadsUpdate()
{
    if (!gamepadsEnable || !navigator.getGamepads || !document.hasFocus() && !debug)
        return;

    // poll gamepads
    const gamepads = navigator.getGamepads();
    for (let i = gamepads.length; i--;)
    {
        // get or create gamepad data
        const gamepad = gamepads[i];
        const data = inputData[i+1] || (inputData[i+1] = []);
        const sticks = stickData[i] || (stickData[i] = []);

        if (gamepad)
        {
            // read clamp dead zone of analog sticks
            const deadZone = .3, deadZoneMax = .8;
            const applyDeadZone = (v: any) => v >  deadZone ?  percent( v, deadZoneMax, deadZone) : 
            v < -deadZone ? -percent(-v, deadZoneMax, deadZone) : 0;

            // read analog sticks
            for (let j = 0; j < gamepad.axes.length-1; j+=2)
                sticks[j>>1] = vec2(applyDeadZone(gamepad.axes[j]), applyDeadZone(-gamepad.axes[j+1])).clampLength();
            
            // read buttons
            for (let j = gamepad.buttons.length; j--;)
            {
                const button = gamepad.buttons[j];

                // @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'never'.
                data[j] = button.pressed ? 1 + 2*!gamepadIsDown(j,i) : 4*gamepadIsDown(j,i);

                // @ts-expect-error ts-migrate(2363) FIXME: The right-hand side of an arithmetic operation mus... Remove this comment to see the full error message
                usingGamepad |= !i && button.pressed;
            }
            
            if (copyGamepadDirectionToStick)
            {
                // copy dpad to left analog stick when pressed
                const dpad = vec2(gamepadIsDown(15,i) - gamepadIsDown(14,i), gamepadIsDown(12,i) - gamepadIsDown(13,i));
                if (dpad.lengthSquared())
                    sticks[0] = dpad.clampLength();
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// Touch input

/** True if a touch device has been detected
 *  @const {boolean}
 *  @memberof Input */
 export const isTouchDevice = touchInputEnable && window.ontouchstart !== undefined;
if (isTouchDevice)
{
    // handle all touch events the same way
    let wasTouching: any, hadTouchInput: any;
    ontouchstart = ontouchmove = ontouchend = e=>
    {

        // @ts-expect-error ts-migrate(2339) FIXME: Property 'button' does not exist on type 'TouchEve... Remove this comment to see the full error message
        e.button = 0; // all touches are left click

        // check if touching and pass to mouse events
        const touching = e.touches.length;
        if (touching)
        {
            hadTouchInput || zzfx(0, hadTouchInput=1) ; // fix mobile audio, force it to play a sound the first time

            // set event pos and pass it along

            // @ts-expect-error ts-migrate(2339) FIXME: Property 'x' does not exist on type 'TouchEvent'.
            e.x = e.touches[0].clientX;

            // @ts-expect-error ts-migrate(2339) FIXME: Property 'y' does not exist on type 'TouchEvent'.
            e.y = e.touches[0].clientY;

            // @ts-expect-error ts-migrate(2721) FIXME: Cannot invoke an object which is possibly 'null'.
            wasTouching ? onmousemove(e) : onmousedown(e);
        }
        else if (wasTouching)

            // @ts-expect-error ts-migrate(2721) FIXME: Cannot invoke an object which is possibly 'null'.
            onmouseup(e);

        // set was touching
        wasTouching = touching;

        // prevent normal mouse events from being called
        return !e.cancelable;
    }
}