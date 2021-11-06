"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
var engineName = 'LittleJS';
/** Version of engine */
var engineVersion = '1.1.2';
/** Frames per second to update objects
 *  @default */
var FPS = 60;
/** How many seconds each frame lasts, engine uses a fixed time step
 *  @default 1/60 */
var timeDelta = 1 / FPS;
/** Array containing all engine objects */
var engineObjects = [];
/** Array containing only objects that are set to collide with other objects (for optimization) */
var engineCollideObjects = [];
/** Current update frame, used to calculate time */
var frame = 0;
/** Current engine time since start in seconds, derived from frame */
var time = 0;
/** Actual clock time since start in seconds (not affected by pause or frame rate clamping) */
var timeReal = 0;
/** Is the game paused? Causes time and objects to not be updated. */
var paused = 0;
// Engine internal variables not exposed to documentation
var frameTimeLastMS = 0, frameTimeBufferMS = 0, debugFPS = 0, shrinkTilesX, shrinkTilesY, drawCount, tileImageSize, tileImageSizeInverse;
///////////////////////////////////////////////////////////////////////////////
/** Start up LittleJS engine with your callback functions
 *  @param {Function} gameInit       - Called once after the engine starts up, setup the game
 *  @param {Function} gameUpdate     - Called every frame at 60 frames per second, handle input and update the game state
 *  @param {Function} gameUpdatePost - Called after physics and objects are updated, setup camera and prepare for render
 *  @param {Function} gameRender     - Called before objects are rendered, draw any background effects that appear behind objects
 *  @param {Function} gameRenderPost - Called after objects are rendered, draw effects or hud that appear above all objects
 *  @param {String} tileImageSource  - Tile image to use, everything starts when the image is finished loading
 */
function engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, tileImageSource) {
    // init engine when tiles load
    tileImage.onload = function () {
        // save tile image info
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
        tileImageSizeInverse = vec2(1).divide(tileImageSize = vec2(tileImage.width, tileImage.height));
        debug && (tileImage.onload = function () { return ASSERT(1); }); // tile sheet can not reloaded
        shrinkTilesX = tileBleedShrinkFix / tileImageSize.x;
        shrinkTilesY = tileBleedShrinkFix / tileImageSize.y;
        // setup html
        document.body.appendChild(mainCanvas = document.createElement('canvas'));
        // @ts-expect-error ts-migrate(2540) FIXME: Cannot assign to 'style' because it is a read-only... Remove this comment to see the full error message
        document.body.style = 'margin:0;overflow:hidden;background:#000';
        mainCanvas.style = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)' +
            (pixelated ? ';image-rendering:crisp-edges;image-rendering:pixelated' : ''); // pixelated rendering
        mainContext = mainCanvas.getContext('2d');
        // init stuff and start engine
        debugInit();
        glInit();
        // create overlay canvas for hud to appear above gl canvas
        document.body.appendChild(overlayCanvas = document.createElement('canvas'));
        overlayCanvas.style = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)';
        overlayContext = overlayCanvas.getContext('2d');
        gameInit();
        engineUpdate();
    };
    // main update loop
    var engineUpdate = function (frameTimeMS) {
        if (frameTimeMS === void 0) { frameTimeMS = 0; }
        requestAnimationFrame(engineUpdate);
        // update time keeping
        var frameTimeDeltaMS = frameTimeMS - frameTimeLastMS;
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
            var deltaSmooth = 0;
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
                var aspect = innerWidth / innerHeight;
                var fixedAspect = fixedWidth / fixedHeight;
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
        mainCanvasSize = vec2(overlayCanvas.width = mainCanvas.width, overlayCanvas.height = mainCanvas.height);
        mainContext.imageSmoothingEnabled = !pixelated; // disable smoothing for pixel art
        // render sort then render while removing destroyed objects
        glPreRender(mainCanvas.width, mainCanvas.height);
        gameRender();
        // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'a' implicitly has an 'any' type.
        engineObjects.sort(function (a, b) { return a.renderOrder - b.renderOrder; });
        for (var _i = 0, engineObjects_1 = engineObjects; _i < engineObjects_1.length; _i++) {
            var o = engineObjects_1[_i];
            o.destroyed || o.render();
        }
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
            var text = engineName + ' ' + 'v' + engineVersion + ' / '
                + drawCount + ' / ' + engineObjects.length + ' / ' + debugFPS.toFixed(1);
            overlayContext.fillText(text, mainCanvas.width - 3, 3);
            overlayContext.fillStyle = '#fff';
            overlayContext.fillText(text, mainCanvas.width - 2, 2);
            drawCount = 0;
        }
    };
    // set tile image source to load the image and start the engine
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 1 arguments, but got 0.
    tileImageSource ? tileImage.src = tileImageSource : tileImage.onload();
}
///////////////////////////////////////////////////////////////////////////////
/** Calls update on each engine object (recursively if child), removes destroyed objects, and updated time */
function engineObjectsUpdate() {
    // recursive object update
    var updateObject = function (o) {
        if (!o.destroyed) {
            o.update();
            for (var _i = 0, _a = o.children; _i < _a.length; _i++) {
                var child = _a[_i];
                updateObject(child);
            }
        }
    };
    for (var _i = 0, engineObjects_2 = engineObjects; _i < engineObjects_2.length; _i++) {
        var o = engineObjects_2[_i];
        o.parent || updateObject(o);
    }
    // remove destroyed objects
    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'o' implicitly has an 'any' type.
    engineObjects = engineObjects.filter(function (o) { return !o.destroyed; });
    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'o' implicitly has an 'any' type.
    engineCollideObjects = engineCollideObjects.filter(function (o) { return !o.destroyed; });
    // increment frame and update time
    time = ++frame / FPS;
}
/** Detroy and remove all objects that are not persistent or descendants of a persistent object */
function engineObjectsDestroy() {
    for (var _i = 0, engineObjects_3 = engineObjects; _i < engineObjects_3.length; _i++) {
        var o = engineObjects_3[_i];
        o.persistent || o.parent || o.destroy();
    }
    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'o' implicitly has an 'any' type.
    engineObjects = engineObjects.filter(function (o) { return !o.destroyed; });
}
/** Triggers a callback for each object within a given area
 *  @param {Vector2} [pos] - Center of test area
 *  @param {Number} [size] - Radius of circle if float, rectangle size if Vector2
 *  @param {Function} [callbackFunction] - Calls this function on every object that passes the test
 *  @param {Array} [objects=engineObjects] - List of objects to check */
function engineObjectsCallback(pos, size, callbackFunction, objects) {
    if (objects === void 0) { objects = engineObjects; }
    if (!pos) {
        // all objects
        for (var _i = 0, objects_1 = objects; _i < objects_1.length; _i++) {
            var o = objects_1[_i];
            callbackFunction(o);
        }
    }
    else if (size.x != undefined) {
        // aabb test
        for (var _a = 0, objects_2 = objects; _a < objects_2.length; _a++) {
            var o = objects_2[_a];
            isOverlapping(pos, size, o.pos, o.size) && callbackFunction(o);
        }
    }
    else {
        // circle test
        var sizeSquared = size * size;
        for (var _b = 0, objects_3 = objects; _b < objects_3.length; _b++) {
            var o = objects_3[_b];
            pos.distanceSquared(o.pos) < sizeSquared && callbackFunction(o);
        }
    }
}
/** Sound Object - Stores a zzfx sound for later use and can be played positionally */
// @ts-expect-error ts-migrate(2300) FIXME: Duplicate identifier 'Sound'.
var Sound = /** @class */ (function () {
    /** Create a sound object and cache the zzfx samples for later use
     *  @param {Array}  zzfxSound - Array of zzfx parameters, ex. [.5,.5]
     *  @param {Number} [range=defaultSoundRange] - World space max range of sound, will not play if camera is farther away
     *  @param {Number} [taper=defaultSoundTaper] - At what percentage of range should it start tapering off
     */
    function Sound(zzfxSound, range, taper) {
        if (range === void 0) { range = defaultSoundRange; }
        if (taper === void 0) { taper = defaultSoundTaper; }
        if (!soundEnable)
            return;
        this.range = range;
        this.taper = taper;
        // get randomness from sound parameters
        this.randomness = zzfxSound[1] || 0;
        zzfxSound[1] = 0;
        // generate sound now for fast playback
        this.cachedSamples = zzfxG.apply(void 0, zzfxSound);
    }
    /** Play the sound
     *  @param {Vector2} [pos] - World space position to play the sound, sound is not attenuated if null
     *  @param {Number}  [volume=1] - How much to scale volume by (in addition to range fade)
     *  @param {Number}  [pitch=1] - How much to scale pitch by (also adjusted by this.randomness)
     *  @param {Number}  [randomnessScale=1] - How much to scale randomness
     *  @return {AudioBufferSourceNode} - The audio, can be used to stop sound later
     */
    Sound.prototype.play = function (pos, volume, pitch, randomnessScale) {
        if (volume === void 0) { volume = 1; }
        if (pitch === void 0) { pitch = 1; }
        if (randomnessScale === void 0) { randomnessScale = 1; }
        if (!soundEnable)
            return;
        var pan = 0;
        if (pos) {
            var range = this.range;
            if (range) {
                // apply range based fade
                var lengthSquared = cameraPos.distanceSquared(pos);
                if (lengthSquared > range * range)
                    return; // out of range
                // attenuate volume by distance
                volume *= percent(Math.pow(lengthSquared, .5), range * this.taper, range);
            }
            // get pan from screen space coords
            pan = worldToScreen(pos).x * 2 / mainCanvas.width - 1;
        }
        // play the sound
        var playbackRate = pitch + pitch * this.randomness * randomnessScale * rand(-1, 1);
        return playSamples([this.cachedSamples], volume, playbackRate, pan);
    };
    /** Play the sound as a note with a semitone offset
     *  @param {Number}  semitoneOffset - How many semitones to offset pitch
     *  @param {Vector2} [pos] - World space position to play the sound, sound is not attenuated if null
     *  @param {Number}  [volume=1] - How much to scale volume by (in addition to range fade)
     *  @return {AudioBufferSourceNode} - The audio, can be used to stop sound later
     */
    Sound.prototype.playNote = function (semitoneOffset, pos, volume) {
        if (volume === void 0) { volume = 1; }
        if (!soundEnable)
            return;
        return this.play(pos, volume, Math.pow(2, (semitoneOffset / 12)), 0);
    };
    return Sound;
}());
/** Music Object - Stores a zzfx music track for later use */
// @ts-expect-error ts-migrate(2300) FIXME: Duplicate identifier 'Music'.
var Music = /** @class */ (function () {
    /** Create a music object and cache the zzfx music samples for later use
     *  @param {Array} zzfxMusic - Array of zzfx music parameters
     */
    function Music(zzfxMusic) {
        if (!soundEnable)
            return;
        // @ts-expect-error ts-migrate(2556) FIXME: Expected 3-4 arguments, but got 0 or more.
        this.cachedSamples = zzfxM.apply(void 0, zzfxMusic);
    }
    /** Play the music
     *  @param {Number}  [volume=1] - How much to scale volume by
     *  @param {Boolean} [loop=1] - True if the music should loop when it reaches the end
     *  @return {AudioBufferSourceNode} - The audio node, can be used to stop sound later
     */
    Music.prototype.play = function (volume, loop) {
        if (volume === void 0) { volume = 1; }
        if (loop === void 0) { loop = 1; }
        if (!soundEnable)
            return;
        return playSamples(this.cachedSamples, volume, 1, 0, loop);
    };
    return Music;
}());
/** Play an mp3 or wav audio from a local file or url
 *  @param {String}  url - Location of sound file to play
 *  @param {Number}  [volume=1] - How much to scale volume by
 *  @param {Boolean} [loop=1] - True if the music should loop when it reaches the end
 *  @return {HTMLAudioElement} - The audio element for this sound
 *  @memberof Audio */
function playAudioFile(url, volume, loop) {
    if (volume === void 0) { volume = 1; }
    if (loop === void 0) { loop = 1; }
    if (!soundEnable)
        return;
    var audio = new Audio(url);
    audio.volume = audioVolume * volume;
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'boolean'.
    audio.loop = loop;
    audio.play();
    return audio;
}
/** Speak text with passed in settings
 *  @param {String} text - The text to speak
 *  @param {String} [language] - The language/accent to use (examples: en, it, ru, ja, zh)
 *  @param {Number} [volume=1] - How much to scale volume by
 *  @param {Number} [rate=1] - How quickly to speak
 *  @param {Number} [pitch=1] - How much to change the pitch by
 *  @return {SpeechSynthesisUtterance} - The utterance that was spoken
 *  @memberof Audio */
function speak(text, language, volume, rate, pitch) {
    if (language === void 0) { language = ''; }
    if (volume === void 0) { volume = 1; }
    if (rate === void 0) { rate = 1; }
    if (pitch === void 0) { pitch = 1; }
    if (!soundEnable || !speechSynthesis)
        return;
    // common languages (not supported by all browsers)
    // en - english,  it - italian, fr - french,  de - german, es - spanish
    // ja - japanese, ru - russian, zh - chinese, hi - hindi,  ko - korean
    // build utterance and speak
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.volume = 2 * volume * audioVolume;
    utterance.rate = rate;
    utterance.pitch = pitch;
    speechSynthesis.speak(utterance);
    return utterance;
}
/** Stop all queued speech
 *  @memberof Audio */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'stopSpeech... Remove this comment to see the full error message
var stopSpeech = function () { return speechSynthesis && speechSynthesis.cancel(); };
/** Get frequency of a note on a musical scale
 *  @param {Number} semitoneOffset - How many semitones away from the root note
 *  @param {Number} [rootNoteFrequency=220] - Frequency at semitone offset 0
 *  @return {Number} - The frequency of the note
 *  @memberof Audio */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getNoteFre... Remove this comment to see the full error message
var getNoteFrequency = function (semitoneOffset, rootFrequency) {
    if (rootFrequency === void 0) { rootFrequency = 220; }
    return rootFrequency * Math.pow(2, (semitoneOffset / 12));
};
///////////////////////////////////////////////////////////////////////////////
/** Audio context used by the engine
 *  @memberof Audio */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'audioConte... Remove this comment to see the full error message
var audioContext;
/** Play cached audio samples with given settings
 *  @param {Array}   sampleChannels - Array of arrays of samples to play (for stereo playback)
 *  @param {Number}  [volume=1] - How much to scale volume by
 *  @param {Number}  [rate=1] - The playback rate to use
 *  @param {Number}  [pan=0] - How much to apply stereo panning
 *  @param {Boolean} [loop=0] - True if the sound should loop when it reaches the end
 *  @return {AudioBufferSourceNode} - The audio node of the sound played
 *  @memberof Audio */
function playSamples(sampleChannels, volume, rate, pan, loop) {
    if (volume === void 0) { volume = 1; }
    if (rate === void 0) { rate = 1; }
    if (pan === void 0) { pan = 0; }
    if (loop === void 0) { loop = 0; }
    if (!soundEnable)
        return;
    // create audio context
    // @ts-expect-error ts-migrate(7005) FIXME: Variable 'audioContext' implicitly has an 'any' ty... Remove this comment to see the full error message
    if (!audioContext)
        // @ts-expect-error ts-migrate(2304) FIXME: Cannot find name 'webkitAudioContext'.
        audioContext = new (window.AudioContext || webkitAudioContext);
    // create buffer and source
    // @ts-expect-error ts-migrate(7005) FIXME: Variable 'audioContext' implicitly has an 'any' ty... Remove this comment to see the full error message
    var buffer = audioContext.createBuffer(sampleChannels.length, sampleChannels[0].length, zzfxR), 
    // @ts-expect-error ts-migrate(7005) FIXME: Variable 'audioContext' implicitly has an 'any' ty... Remove this comment to see the full error message
    source = audioContext.createBufferSource();
    // copy samples to buffer and setup source
    sampleChannels.forEach(function (c, i) { return buffer.getChannelData(i).set(c); });
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.loop = loop;
    // create pan and gain nodes
    source
        // @ts-expect-error ts-migrate(7005) FIXME: Variable 'audioContext' implicitly has an 'any' ty... Remove this comment to see the full error message
        .connect(new StereoPannerNode(audioContext, { 'pan': clamp(pan, 1, -1) }))
        // @ts-expect-error ts-migrate(7005) FIXME: Variable 'audioContext' implicitly has an 'any' ty... Remove this comment to see the full error message
        .connect(new GainNode(audioContext, { 'gain': audioVolume * volume }))
        // @ts-expect-error ts-migrate(7005) FIXME: Variable 'audioContext' implicitly has an 'any' ty... Remove this comment to see the full error message
        .connect(audioContext.destination);
    // play and return sound
    source.start();
    return source;
}
///////////////////////////////////////////////////////////////////////////////
// ZzFXMicro - Zuper Zmall Zound Zynth - v1.1.8 by Frank Force
/** Generate and play a ZzFX sound
 *  @param {Array} zzfxSound - Array of ZzFX parameters, ex. [.5,.5]
 *  @return {Array} - Array of audio samples
 *  @memberof Audio */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'zzfx'.
var zzfx = function () {
    var zzfxSound = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        zzfxSound[_i] = arguments[_i];
    }
    return playSamples([zzfxG.apply(void 0, zzfxSound)]);
};
/** Sample rate used for all ZzFX sounds
 *  @default 44100
 *  @memberof Audio */
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'zzfxR'.
var zzfxR = 44100;
/** Generate samples for a ZzFX sound
 *  @memberof Audio */
function zzfxG(
// parameters
volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo) {
    if (volume === void 0) { volume = 1; }
    if (randomness === void 0) { randomness = .05; }
    if (frequency === void 0) { frequency = 220; }
    if (attack === void 0) { attack = 0; }
    if (sustain === void 0) { sustain = 0; }
    if (release === void 0) { release = .1; }
    if (shape === void 0) { shape = 0; }
    if (shapeCurve === void 0) { shapeCurve = 1; }
    if (slide === void 0) { slide = 0; }
    if (deltaSlide === void 0) { deltaSlide = 0; }
    if (pitchJump === void 0) { pitchJump = 0; }
    if (pitchJumpTime === void 0) { pitchJumpTime = 0; }
    if (repeatTime === void 0) { repeatTime = 0; }
    if (noise === void 0) { noise = 0; }
    if (modulation === void 0) { modulation = 0; }
    if (bitCrush === void 0) { bitCrush = 0; }
    if (delay === void 0) { delay = 0; }
    if (sustainVolume === void 0) { sustainVolume = 1; }
    if (decay === void 0) { decay = 0; }
    if (tremolo === void 0) { tremolo = 0; }
    // init parameters
    var PI2 = PI * 2, sign = function (v) { return v > 0 ? 1 : -1; }, startSlide = slide *= 500 * PI2 / zzfxR / zzfxR, b = [], startFrequency = frequency *= (1 + randomness * rand(-1, 1)) * PI2 / zzfxR, t = 0, tm = 0, i = 0, j = 1, r = 0, c = 0, s = 0, f, length;
    // scale by sample rate
    attack = attack * zzfxR + 9; // minimum attack to prevent pop
    decay *= zzfxR;
    sustain *= zzfxR;
    release *= zzfxR;
    delay *= zzfxR;
    deltaSlide *= 500 * PI2 / Math.pow(zzfxR, 3);
    modulation *= PI2 / zzfxR;
    pitchJump *= PI2 / zzfxR;
    pitchJumpTime *= zzfxR;
    repeatTime = repeatTime * zzfxR | 0;
    // generate waveform
    for (length = attack + decay + sustain + release + delay | 0; i < length; b[i++] = s) {
        if (!(++c % (bitCrush * 100 | 0))) // bit crush
         {
            s = shape ? shape > 1 ? shape > 2 ? shape > 3 ? // wave shape
                Math.sin(Math.pow((t % PI2), 3)) : // 4 noise
                Math.max(Math.min(Math.tan(t), 1), -1) : // 3 tan
                1 - (2 * t / PI2 % 2 + 2) % 2 : // 2 saw
                1 - 4 * abs(Math.round(t / PI2) - t / PI2) : // 1 triangle
                Math.sin(t); // 0 sin
            s = (repeatTime ?
                1 - tremolo + tremolo * Math.sin(PI2 * i / repeatTime) // tremolo
                : 1) *
                sign(s) * (Math.pow(abs(s), shapeCurve)) * // curve 0=square, 2=pointy
                volume * audioVolume * ( // envelope
            i < attack ? i / attack : // attack
                i < attack + decay ? // decay
                    1 - ((i - attack) / decay) * (1 - sustainVolume) : // decay falloff
                    i < attack + decay + sustain ? // sustain
                        sustainVolume : // sustain volume
                        i < length - delay ? // release
                            (length - i - delay) / release * // release falloff
                                sustainVolume : // release volume
                            0); // post release
            s = delay ? s / 2 + (delay > i ? 0 : // delay
                (i < length - delay ? 1 : (length - i) / delay) * // release delay 
                    b[i - delay | 0] / 2) : s; // sample delay
        }
        f = (frequency += slide += deltaSlide) * // frequency
            Math.cos(modulation * tm++); // modulation
        t += f - f * noise * (1 - (Math.sin(i) + 1) * 1e9 % 2); // noise
        if (j && ++j > pitchJumpTime) // pitch jump
         {
            frequency += pitchJump; // apply pitch jump
            startFrequency += pitchJump; // also apply to start
            j = 0; // reset pitch jump time
        }
        if (repeatTime && !(++r % repeatTime)) // repeat
         {
            frequency = startFrequency; // reset frequency
            slide = startSlide; // reset slide
            j = j || 1; // reset pitch jump time
        }
    }
    return b;
}
///////////////////////////////////////////////////////////////////////////////
// ZzFX Music Renderer v2.0.3 by Keith Clark and Frank Force
/** Generate samples for a ZzFM song with given parameters
 *  @param {Array} instruments - Array of ZzFX sound paramaters
 *  @param {Array} patterns - Array of pattern data
 *  @param {Array} sequence - Array of pattern indexes
 *  @param {Number} [BPM=125] - Playback speed of the song in BPM
 *  @returns {Array} - Left and right channel sample data
 *  @memberof Audio */
function zzfxM(instruments, patterns, sequence, BPM) {
    if (BPM === void 0) { BPM = 125; }
    var instrumentParameters;
    var i;
    var j;
    var k;
    var note;
    var sample;
    var patternChannel;
    var notFirstBeat;
    var stop;
    var instrument;
    var pitch;
    var attenuation;
    var outSampleOffset;
    var isSequenceEnd;
    var sampleOffset = 0;
    var nextSampleOffset;
    var sampleBuffer = [];
    var leftChannelBuffer = [];
    var rightChannelBuffer = [];
    var channelIndex = 0;
    var panning = 0;
    var hasMore = 1;
    var sampleCache = {};
    var beatLength = zzfxR / BPM * 60 >> 2;
    // for each channel in order until there are no more
    for (; hasMore; channelIndex++) {
        // reset current values
        sampleBuffer = [hasMore = notFirstBeat = pitch = outSampleOffset = 0];
        // for each pattern in sequence
        sequence.forEach(function (patternIndex, sequenceIndex) {
            // get pattern for current channel, use empty 1 note pattern if none found
            patternChannel = patterns[patternIndex][channelIndex] || [0, 0, 0];
            // check if there are more channels
            // @ts-expect-error ts-migrate(2363) FIXME: The right-hand side of an arithmetic operation mus... Remove this comment to see the full error message
            hasMore |= !!patterns[patternIndex][channelIndex];
            // get next offset, use the length of first channel
            // @ts-expect-error ts-migrate(2363) FIXME: The right-hand side of an arithmetic operation mus... Remove this comment to see the full error message
            nextSampleOffset = outSampleOffset + (patterns[patternIndex][0].length - 2 - !notFirstBeat) * beatLength;
            // for each beat in pattern, plus one extra if end of sequence
            isSequenceEnd = sequenceIndex == sequence.length - 1;
            for (i = 2, k = outSampleOffset; i < patternChannel.length + isSequenceEnd; notFirstBeat = ++i) {
                // <channel-note>
                note = patternChannel[i];
                // stop if end, different instrument or new note
                stop = i == patternChannel.length + isSequenceEnd - 1 && isSequenceEnd ||
                    // @ts-expect-error ts-migrate(2362) FIXME: The left-hand side of an arithmetic operation must... Remove this comment to see the full error message
                    instrument != (patternChannel[0] || 0) | note | 0;
                // fill buffer with samples for previous beat, most cpu intensive part
                for (j = 0; j < beatLength && notFirstBeat; 
                // fade off attenuation at end of beat if stopping note, prevents clicking
                // @ts-expect-error ts-migrate(2362) FIXME: The left-hand side of an arithmetic operation must... Remove this comment to see the full error message
                j++ > beatLength - 99 && stop ? attenuation += (attenuation < 1) / 99 : 0) {
                    // copy sample to stereo buffers with panning
                    sample = (1 - attenuation) * sampleBuffer[sampleOffset++] / 2 || 0;
                    leftChannelBuffer[k] = (leftChannelBuffer[k] || 0) - sample * panning + sample;
                    rightChannelBuffer[k] = (rightChannelBuffer[k++] || 0) + sample * panning + sample;
                }
                // set up for next note
                if (note) {
                    // set attenuation
                    attenuation = note % 1;
                    panning = patternChannel[1] || 0;
                    if (note |= 0) {
                        // get cached sample
                        sampleBuffer = sampleCache[
                        // @ts-expect-error ts-migrate(2538) FIXME: Type 'any[]' cannot be used as an index type.
                        [
                            instrument = patternChannel[sampleOffset = 0] || 0,
                            note
                        ]
                        // @ts-expect-error ts-migrate(2538) FIXME: Type 'any[]' cannot be used as an index type.
                        ] = sampleCache[[instrument, note]] || (
                        // add sample to cache
                        instrumentParameters = __spreadArray([], instruments[instrument], true),
                            instrumentParameters[2] *= Math.pow(2, ((note - 12) / 12)),
                            // allow negative values to stop notes
                            note > 0 ? zzfxG.apply(void 0, instrumentParameters) : []);
                    }
                }
            }
            // update the sample offset
            outSampleOffset = nextSampleOffset;
        });
    }
    return [leftChannelBuffer, rightChannelBuffer];
}
/** True if debug is enabled
 *  @default
 *  @memberof Debug */
var debug = 1;
/** True if asserts are enaled
 *  @default
 *  @memberof Debug */
var enableAsserts = 1;
/** Size to render debug points by default
 *  @default
 *  @memberof Debug */
var debugPointSize = .5;
/** True if watermark with FPS should be down
 *  @default
 *  @memberof Debug */
var showWatermark = 1;
/** True if god mode is enabled, handle this however you want
 *  @default
 *  @memberof Debug */
var godMode = 0;
// Engine internal variables not exposed to documentation
var debugPrimitives = [], debugOverlay = 0, debugPhysics = 0, debugRaycast = 0, debugParticles = 0, debugGamepads = 0, debugMedals = 0, debugTakeScreenshot, downloadLink;
///////////////////////////////////////////////////////////////////////////////
// Debug helper functions
/** Asserts if the experssion is false, does not do anything in release builds
 *  @param {Boolean} assertion
 *  @param {Object}  output
 *  @memberof Debug */
var ASSERT = enableAsserts ? function () {
    var assert = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        assert[_i] = arguments[_i];
    }
    return console.assert.apply(console, assert);
} : function () { };
/** Draw a debug rectangle in world space
 *  @param {Vector2} pos
 *  @param {Vector2} [size=new Vector2()]
 *  @param {String}  [color='#fff']
 *  @param {Number}  [time=0]
 *  @param {Number}  [angle=0]
 *  @param {Boolean} [fill=0]
 *  @memberof Debug */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 0.
var debugRect = function (pos, size, color, time, angle, fill) {
    if (size === void 0) { size = vec2(); }
    if (color === void 0) { color = '#fff'; }
    if (time === void 0) { time = 0; }
    if (angle === void 0) { angle = 0; }
    if (fill === void 0) { fill = 0; }
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
    ASSERT(typeof color == 'string'); // pass in regular html strings as colors
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
    debugPrimitives.push({ pos: pos, size: vec2(size), color: color, time: new Timer(time), angle: angle, fill: fill });
};
/** Draw a debug circle in world space
 *  @param {Vector2} pos
 *  @param {Number}  [radius=0]
 *  @param {String}  [color='#fff']
 *  @param {Number}  [time=0]
 *  @param {Boolean} [fill=0]
 *  @memberof Debug */
var debugCircle = function (pos, radius, color, time, fill) {
    if (radius === void 0) { radius = 0; }
    if (color === void 0) { color = '#fff'; }
    if (time === void 0) { time = 0; }
    if (fill === void 0) { fill = 0; }
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
    ASSERT(typeof color == 'string'); // pass in regular html strings as colors
    debugPrimitives.push({ pos: pos, size: radius, color: color, time: new Timer(time), angle: 0, fill: fill });
};
/** Draw a debug point in world space
 *  @param {Vector2} pos
 *  @param {String}  [color='#fff']
 *  @param {Number}  [time=0]
 *  @param {Number}  [angle=0]
 *  @memberof Debug */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 5.
var debugPoint = function (pos, color, time, angle) { return debugRect(pos, 0, color, time, angle); };
/** Draw a debug line in world space
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {String}  [color='#fff']
 *  @param {Number}  [thickness=.1]
 *  @param {Number}  [time=0]
 *  @memberof Debug */
var debugLine = function (posA, posB, color, thickness, time) {
    if (thickness === void 0) { thickness = .1; }
    var halfDelta = vec2((posB.x - posA.x) / 2, (posB.y - posA.y) / 2);
    var size = vec2(thickness, halfDelta.length() * 2);
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 6.
    debugRect(posA.add(halfDelta), size, color, time, halfDelta.angle(), 1);
};
/** Draw a debug axis aligned bounding box in world space
 *  @param {Vector2} posA
 *  @param {Vector2} sizeA
 *  @param {Vector2} posB
 *  @param {Vector2} sizeB
 *  @param {String}  [color='#fff']
 *  @memberof Debug */
var debugAABB = function (pA, sA, pB, sB, color) {
    var minPos = vec2(min(pA.x - sA.x / 2, pB.x - sB.x / 2), min(pA.y - sA.y / 2, pB.y - sB.y / 2));
    var maxPos = vec2(max(pA.x + sA.x / 2, pB.x + sB.x / 2), max(pA.y + sA.y / 2, pB.y + sB.y / 2));
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 3.
    debugRect(minPos.lerp(maxPos, .5), maxPos.subtract(minPos), color);
};
/** Draw a debug axis aligned bounding box in world space
 *  @param {String}  text
 *  @param {Vector2} pos
 *  @param {Number}  [size=1]
 *  @param {String}  [color='#fff']
 *  @param {Number}  [time=0]
 *  @param {Number}  [angle=0]
 *  @param {String}  [font='monospace']
 *  @memberof Debug */
var debugText = function (text, pos, size, color, time, angle, font) {
    if (size === void 0) { size = 1; }
    if (color === void 0) { color = '#fff'; }
    if (time === void 0) { time = 0; }
    if (angle === void 0) { angle = 0; }
    if (font === void 0) { font = 'monospace'; }
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
    ASSERT(typeof color == 'string'); // pass in regular html strings as colors
    debugPrimitives.push({ text: text, pos: pos, size: size, color: color, time: new Timer(time), angle: angle, font: font });
};
/** Clear all debug primitives in the list
 *  @memberof Debug */
var debugClear = function () { return debugPrimitives = []; };
/** Save a canvas to disk
 *  @param {HTMLCanvasElement} canvas
 *  @param {String}            [filename]
 *  @memberof Debug */
var debugSaveCanvas = function (canvas, filename) {
    if (filename === void 0) { filename = engineName + '.png'; }
    downloadLink.download = 'screenshot.png';
    downloadLink.href = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
    downloadLink.click();
};
///////////////////////////////////////////////////////////////////////////////
// Engine debug function (called automatically)
var debugInit = function () {
    // create link for saving screenshots
    document.body.appendChild(downloadLink = document.createElement('a'));
    downloadLink.style.display = 'none';
};
var debugUpdate = function () {
    if (!debug)
        return;
    if (keyWasPressed(192)) // ~
        // @ts-expect-error ts-migrate(2588) FIXME: Cannot assign to 'debugOverlay' because it is a co... Remove this comment to see the full error message
        debugOverlay = !debugOverlay;
    if (keyWasPressed(49)) // 1
        // @ts-expect-error ts-migrate(2588) FIXME: Cannot assign to 'debugPhysics' because it is a co... Remove this comment to see the full error message
        debugPhysics = !debugPhysics, debugParticles = 0;
    if (keyWasPressed(50)) // 2
        // @ts-expect-error ts-migrate(2588) FIXME: Cannot assign to 'debugParticles' because it is a ... Remove this comment to see the full error message
        debugParticles = !debugParticles, debugPhysics = 0;
    if (keyWasPressed(51)) // 3
        // @ts-expect-error ts-migrate(2588) FIXME: Cannot assign to 'godMode' because it is a constan... Remove this comment to see the full error message
        godMode = !godMode;
    if (keyWasPressed(53)) // 5
        debugTakeScreenshot = 1;
    //if (keyWasPressed(54)) // 6
    //    debugToggleParticleEditor();
    if (keyWasPressed(55)) // 7
        // @ts-expect-error ts-migrate(2588) FIXME: Cannot assign to 'debugGamepads' because it is a c... Remove this comment to see the full error message
        debugGamepads = !debugGamepads;
    //if (keyWasPressed(56)) // 8
    //if (keyWasPressed(57)) // 9
    if (keyWasPressed(48)) // 0
        // @ts-expect-error ts-migrate(2588) FIXME: Cannot assign to 'showWatermark' because it is a c... Remove this comment to see the full error message
        showWatermark = !showWatermark;
};
var debugRender = function () {
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
    glCopyToContext(mainContext);
    if (debugTakeScreenshot) {
        // composite canvas
        glCopyToContext(mainContext, 1);
        mainContext.drawImage(overlayCanvas, 0, 0);
        overlayCanvas.width |= 0;
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
        debugSaveCanvas(mainCanvas);
        debugTakeScreenshot = 0;
    }
    if (debugGamepads && gamepadsEnable && navigator.getGamepads) {
        // poll gamepads
        var gamepads = navigator.getGamepads();
        for (var i = gamepads.length; i--;) {
            var gamepad = gamepads[i];
            if (gamepad) {
                // gamepad debug display
                var stickScale = 1;
                var buttonScale = .2;
                var centerPos = cameraPos;
                var sticks = stickData[i];
                for (var j = sticks.length; j--;) {
                    var drawPos = centerPos.add(vec2(j * stickScale * 2, i * stickScale * 3));
                    var stickPos = drawPos.add(sticks[j].scale(stickScale));
                    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 5.
                    debugCircle(drawPos, stickScale, '#fff7', 0, 1);
                    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 3.
                    debugLine(drawPos, stickPos, '#f00');
                    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 2.
                    debugPoint(stickPos, '#f00');
                }
                for (var j = gamepad.buttons.length; j--;) {
                    var drawPos = centerPos.add(vec2(j * buttonScale * 2, i * stickScale * 3 - stickScale - buttonScale));
                    var pressed = gamepad.buttons[j].pressed;
                    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 5.
                    debugCircle(drawPos, buttonScale, pressed ? '#f00' : '#fff7', 0, 1);
                    debugText(j, drawPos, .2);
                }
            }
        }
    }
    if (debugOverlay) {
        for (var _i = 0, engineObjects_4 = engineObjects; _i < engineObjects_4.length; _i++) {
            var o = engineObjects_4[_i];
            if (o.canvas)
                continue; // skip tile layers
            var size = o.size.copy();
            size.x = max(size.x, .2);
            size.y = max(size.y, .2);
            var color = new Color(o.collideTiles ? 1 : 0, o.collideSolidObjects ? 1 : 0, o.isSolid ? 1 : 0, o.parent ? .2 : .5);
            // show object info
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 3.
            drawRect(o.pos, size, color);
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 3.
            drawRect(o.pos, size.scale(.8), o.parent ? new Color(1, 1, 1, .5) : new Color(0, 0, 0, .8));
            o.parent && drawLine(o.pos, o.parent.pos, .1, new Color(0, 0, 1, .5));
        }
        // mouse pick
        var bestDistance = Infinity, bestObject = void 0;
        for (var _a = 0, engineObjects_5 = engineObjects; _a < engineObjects_5.length; _a++) {
            var o = engineObjects_5[_a];
            var distance = mousePos.distanceSquared(o.pos);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestObject = o;
            }
        }
        if (bestObject) {
            var saveContext = mainContext;
            mainContext = overlayContext;
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 3 arguments, but got 2.
            var raycastHitPos = tileCollisionRaycast(bestObject.pos, mousePos);
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 3.
            raycastHitPos && drawRect(raycastHitPos.floor().add(vec2(.5)), vec2(1), new Color(0, 1, 1, .3));
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 4 arguments, but got 3.
            drawRect(mousePos.floor().add(vec2(.5)), vec2(1), new Color(0, 0, 1, .5));
            drawLine(mousePos, bestObject.pos, .1, !raycastHitPos ? new Color(0, 1, 0, .5) : new Color(1, 0, 0, .5));
            var pos = mousePos.copy(), height = vec2(0, .5);
            var printVec2 = function (v) { return '(' + (v.x > 0 ? ' ' : '') + (v.x).toFixed(2) + ',' + (v.y > 0 ? ' ' : '') + (v.y).toFixed(2) + ')'; };
            var args = [.5, new Color, .05, undefined, undefined, 'monospace'];
            drawText.apply(void 0, __spreadArray(['pos = ' + printVec2(bestObject.pos)
                    + (bestObject.angle > 0 ? '  ' : ' ') + (bestObject.angle * 180 / PI).toFixed(1) + '°',
                // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
                pos = pos.add(height)], args, false));
            // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
            drawText.apply(void 0, __spreadArray(['vel = ' + printVec2(bestObject.velocity), pos = pos.add(height)], args, false));
            // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
            drawText.apply(void 0, __spreadArray(['size = ' + printVec2(bestObject.size), pos = pos.add(height)], args, false));
            // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
            drawText.apply(void 0, __spreadArray(['collision = ' + getTileCollisionData(mousePos), pos = mousePos.subtract(height)], args, false));
            mainContext = saveContext;
        }
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
        glCopyToContext(mainContext);
    }
    {
        // render debug rects
        overlayContext.lineWidth = 1;
        var pointSize_1 = debugPointSize * cameraScale;
        // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'p' implicitly has an 'any' type.
        debugPrimitives.forEach(function (p) {
            // create canvas transform from world space to screen space
            var pos = worldToScreen(p.pos);
            overlayContext.save();
            overlayContext.lineWidth = 2;
            overlayContext.translate(pos.x | 0, pos.y | 0);
            overlayContext.rotate(p.angle);
            overlayContext.fillStyle = overlayContext.strokeStyle = p.color;
            if (p.text != undefined) {
                overlayContext.font = p.size * cameraScale + 'px ' + p.font;
                overlayContext.textAlign = 'center';
                overlayContext.textBaseline = 'middle';
                overlayContext.fillText(p.text, 0, 0);
            }
            else if (p.size == 0 || p.size.x === 0 && p.size.y === 0) {
                // point
                overlayContext.fillRect(-pointSize_1 / 2, -1, pointSize_1, 3);
                overlayContext.fillRect(-1, -pointSize_1 / 2, 3, pointSize_1);
            }
            else if (p.size.x != undefined) {
                // rect
                var w = p.size.x * cameraScale | 0, h = p.size.y * cameraScale | 0;
                p.fill && overlayContext.fillRect(-w / 2 | 0, -h / 2 | 0, w, h);
                overlayContext.strokeRect(-w / 2 | 0, -h / 2 | 0, w, h);
            }
            else {
                // circle
                overlayContext.beginPath();
                overlayContext.arc(0, 0, p.size * cameraScale, 0, 9);
                p.fill && overlayContext.fill();
                overlayContext.stroke();
            }
            overlayContext.restore();
        });
        overlayContext.fillStyle = overlayContext.strokeStyle = '#fff';
    }
    {
        var x = 9, y = -20, h = 30;
        overlayContext.fillStyle = '#fff';
        overlayContext.textAlign = 'left';
        overlayContext.textBaseline = 'top';
        overlayContext.font = '28px monospace';
        overlayContext.shadowColor = '#000';
        overlayContext.shadowBlur = 9;
        if (debugOverlay) {
            overlayContext.fillText(engineName, x, y += h);
            overlayContext.fillText('Objects: ' + engineObjects.length, x, y += h);
            overlayContext.fillText('Time: ' + formatTime(time), x, y += h);
            overlayContext.fillText('---------', x, y += h);
            overlayContext.fillStyle = '#f00';
            overlayContext.fillText('~: Debug Overlay', x, y += h);
            overlayContext.fillStyle = debugPhysics ? '#f00' : '#fff';
            overlayContext.fillText('1: Debug Physics', x, y += h);
            overlayContext.fillStyle = debugParticles ? '#f00' : '#fff';
            overlayContext.fillText('2: Debug Particles', x, y += h);
            overlayContext.fillStyle = godMode ? '#f00' : '#fff';
            overlayContext.fillText('3: God Mode', x, y += h);
            overlayContext.fillStyle = '#fff';
            overlayContext.fillText('5: Save Screenshot', x, y += h);
            //overlayContext.fillStyle = debugParticleEditor ? '#f00' : '#fff';
            //overlayContext.fillText('6: Particle Editor', x, y += h);
            overlayContext.fillStyle = debugGamepads ? '#f00' : '#fff';
            overlayContext.fillText('7: Debug Gamepads', x, y += h);
        }
        else {
            overlayContext.fillText(debugPhysics ? 'Debug Physics' : '', x, y += h);
            overlayContext.fillText(debugParticles ? 'Debug Particles' : '', x, y += h);
            overlayContext.fillText(godMode ? 'God Mode' : '', x, y += h);
            overlayContext.fillText(debugGamepads ? 'Debug Gamepads' : '', x, y += h);
        }
        overlayContext.shadowBlur = 0;
    }
    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'r' implicitly has an 'any' type.
    debugPrimitives = debugPrimitives.filter(function (r) { return r.time.get() < 0; });
};
///////////////////////////////////////////////////////////////////////////////
// particle system editor (work in progress)
var debugParticleEditor = 0, debugParticleSystem, debugParticleSystemDiv, particleSystemCode;
var debugToggleParticleEditor = function () {
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'boolean' is not assignable to type 'number'.
    debugParticleEditor = !debugParticleEditor;
    if (debugParticleEditor) {
        if (!debugParticleSystem || debugParticleSystem.destroyed)
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 24-26 arguments, but got 1.
            debugParticleSystem = new ParticleEmitter(cameraPos);
    }
    else if (debugParticleSystem && !debugParticleSystem.destroyed)
        debugParticleSystem.destroy();
    var colorToHex = function (color) {
        var componentToHex = function (c) {
            var hex = (c * 255 | 0).toString(16);
            return hex.length == 1 ? '0' + hex : hex;
        };
        return '#' + componentToHex(color.r) + componentToHex(color.g) + componentToHex(color.b);
    };
    var hexToColor = function (hex) {
        return new Color(parseInt(hex.substr(1, 2), 16) / 255, parseInt(hex.substr(3, 2), 16) / 255, parseInt(hex.substr(5, 2), 16) / 255);
    };
    if (!debugParticleSystemDiv) {
        var div = debugParticleSystemDiv = document.createElement('div');
        div.innerHTML = '<big><b>Particle Editor';
        // @ts-expect-error ts-migrate(2540) FIXME: Cannot assign to 'style' because it is a read-only... Remove this comment to see the full error message
        div.style = 'position:absolute;top:10;left:10;color:#fff';
        document.body.appendChild(div);
        var _loop_1 = function (setting) {
            // @ts-expect-error ts-migrate(2322) FIXME: Type 'HTMLInputElement' is not assignable to type ... Remove this comment to see the full error message
            var input = setting[2] = document.createElement('input');
            var name_1 = setting[0];
            var type = setting[1];
            if (type) {
                if (type == 'color') {
                    input.type = type;
                    var color = debugParticleSystem[name_1];
                    input.value = colorToHex(color);
                }
                else if (type == 'alpha' && name_1 == 'colorStartAlpha')
                    input.value = debugParticleSystem.colorStartA.a;
                else if (type == 'alpha' && name_1 == 'colorEndAlpha')
                    input.value = debugParticleSystem.colorEndA.a;
                else if (name_1 == 'tileSizeX')
                    input.value = debugParticleSystem.tileSize.x;
                else if (name_1 == 'tileSizeY')
                    input.value = debugParticleSystem.tileSize.y;
            }
            else
                input.value = debugParticleSystem[name_1] || '0';
            input.oninput = function (e) {
                var inputFloat = parseFloat(input.value) || 0;
                if (type) {
                    if (type == 'color') {
                        var color = hexToColor(input.value);
                        debugParticleSystem[name_1].r = color.r;
                        debugParticleSystem[name_1].g = color.g;
                        debugParticleSystem[name_1].b = color.b;
                    }
                    else if (type == 'alpha' && name_1 == 'colorStartAlpha') {
                        debugParticleSystem.colorStartA.a = clamp(inputFloat);
                        debugParticleSystem.colorStartB.a = clamp(inputFloat);
                    }
                    else if (type == 'alpha' && name_1 == 'colorEndAlpha') {
                        debugParticleSystem.colorEndA.a = clamp(inputFloat);
                        debugParticleSystem.colorEndB.a = clamp(inputFloat);
                    }
                    else if (name_1 == 'tileSizeX') {
                        debugParticleSystem.tileSize = vec2(parseInt(input.value), debugParticleSystem.tileSize.y);
                    }
                    else if (name_1 == 'tileSizeY') {
                        debugParticleSystem.tileSize.y = vec2(debugParticleSystem.tileSize.x, parseInt(input.value));
                    }
                }
                else
                    debugParticleSystem[name_1] = inputFloat;
                updateCode_1();
            };
            div.appendChild(document.createElement('br'));
            div.appendChild(input);
            div.appendChild(document.createTextNode(' ' + name_1));
        };
        for (var _i = 0, debugParticleSettings_1 = debugParticleSettings; _i < debugParticleSettings_1.length; _i++) {
            var setting = debugParticleSettings_1[_i];
            _loop_1(setting);
        }
        div.appendChild(document.createElement('br'));
        div.appendChild(document.createElement('br'));
        div.appendChild(particleSystemCode = document.createElement('input'));
        particleSystemCode.disabled = true;
        div.appendChild(document.createTextNode(' code'));
        div.appendChild(document.createElement('br'));
        var button = document.createElement('button');
        div.appendChild(button);
        button.innerHTML = 'Copy To Clipboard';
        button.onclick = function (e) { return navigator.clipboard.writeText(particleSystemCode.value); };
        var updateCode_1 = function () {
            var code = '';
            var count = 0;
            for (var _i = 0, debugParticleSettings_2 = debugParticleSettings; _i < debugParticleSettings_2.length; _i++) {
                var setting = debugParticleSettings_2[_i];
                var name_2 = setting[0];
                var type = setting[1];
                var value = void 0;
                if (name_2 == 'tileSizeX' || type == 'alpha')
                    continue;
                if (count++)
                    code += ', ';
                if (name_2 == 'tileSizeY') {
                    value = "vec2(" + debugParticleSystem.tileSize.x + "," + debugParticleSystem.tileSize.y + ")";
                }
                else if (type == 'color') {
                    var c = debugParticleSystem[name_2];
                    value = "new Color(" + c.r + "," + c.g + "," + c.b + "," + c.a + ")";
                }
                else
                    value = debugParticleSystem[name_2];
                code += value;
            }
            particleSystemCode.value = '...[' + code + ']';
        };
        updateCode_1();
    }
    debugParticleSystemDiv.style.display = debugParticleEditor ? '' : 'none';
};
var debugParticleSettings = [
    ['emitSize'],
    ['emitTime'],
    ['emitRate'],
    ['emitConeAngle'],
    ['tileIndex'],
    ['tileSizeX', 'tileSize'],
    ['tileSizeY', 'tileSize'],
    ['colorStartA', 'color'],
    ['colorStartB', 'color'],
    ['colorStartAlpha', 'alpha'],
    ['colorEndA', 'color'],
    ['colorEndB', 'color'],
    ['colorEndAlpha', 'alpha'],
    ['particleTime'],
    ['sizeStart'],
    ['sizeEnd'],
    ['speed'],
    ['angleSpeed'],
    ['damping'],
    ['angleDamping'],
    ['gravityScale'],
    ['particleConeAngle'],
    ['fadeRate'],
    ['randomness'],
    ['collideTiles'],
    ['additive'],
    ['randomColorComponents'],
    ['renderOrder'],
];
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
var tileImage = new Image();
/** The primary 2D canvas visible to the user
 *  @type {HTMLCanvasElement}
 *  @memberof Draw */
var mainCanvas;
/** 2d context for mainCanvas
 *  @type {CanvasRenderingContext2D}
 *  @memberof Draw */
var mainContext;
/** A canvas that appears on top of everything the same size as mainCanvas
 *  @type {HTMLCanvasElement}
 *  @memberof Draw */
var overlayCanvas;
/** 2d context for overlayCanvas
 *  @type {CanvasRenderingContext2D}
 *  @memberof Draw */
var overlayContext;
/** The size of the main canvas (and other secondary canvases: overlayCanvas and glCanvas)
 *  @type {Vector2}
 *  @memberof Draw */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 0.
var mainCanvasSize = vec2();
/** Convert from screen to world space coordinates
 *  @param {Vector2} screenPos
 *  @return {Vector2}
 *  @memberof Draw */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
var screenToWorld = function (screenPos) { return screenPos.add(vec2(.5)).subtract(mainCanvasSize.scale(.5)).multiply(vec2(1 / cameraScale, -1 / cameraScale)).add(cameraPos); };
/** Convert from world to screen space coordinates
 *  @param {Vector2} worldPos
 *  @return {Vector2}
 *  @memberof Draw */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
var worldToScreen = function (worldPos) { return worldPos.subtract(cameraPos).multiply(vec2(cameraScale, -cameraScale)).add(mainCanvasSize.scale(.5)).subtract(vec2(.5)); };
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
function drawTile(pos, size, tileIndex, tileSize, color, angle, mirror, additiveColor) {
    if (size === void 0) { size = vec2(1); }
    if (tileIndex === void 0) { tileIndex = -1; }
    if (tileSize === void 0) { tileSize = defaultTileSize; }
    if (color === void 0) { color = new Color; }
    if (angle === void 0) { angle = 0; }
    if (additiveColor === void 0) { additiveColor = new Color(0, 0, 0, 0); }
    showWatermark && ++drawCount;
    if (glEnable) {
        if (tileIndex < 0) {
            // if negative tile index, force untextured
            glDraw(pos.x, pos.y, size.x, size.y, angle, 0, 0, 0, 0, 0, color.rgbaInt());
        }
        else {
            // calculate uvs and render
            var cols = tileImage.width / tileSize.x | 0;
            // @ts-expect-error ts-migrate(7005) FIXME: Variable 'tileImageSizeInverse' implicitly has an ... Remove this comment to see the full error message
            var uvSizeX = tileSize.x * tileImageSizeInverse.x;
            // @ts-expect-error ts-migrate(7005) FIXME: Variable 'tileImageSizeInverse' implicitly has an ... Remove this comment to see the full error message
            var uvSizeY = tileSize.y * tileImageSizeInverse.y;
            var uvX = (tileIndex % cols) * uvSizeX, uvY = (tileIndex / cols | 0) * uvSizeY;
            // shrink uvs to prevent bleeding
            // @ts-expect-error ts-migrate(7005) FIXME: Variable 'tileImageSizeInverse' implicitly has an ... Remove this comment to see the full error message
            var shrinkTilesX_1 = tileBleedShrinkFix * tileImageSizeInverse.x;
            // @ts-expect-error ts-migrate(7005) FIXME: Variable 'tileImageSizeInverse' implicitly has an ... Remove this comment to see the full error message
            var shrinkTilesY_1 = tileBleedShrinkFix * tileImageSizeInverse.y;
            glDraw(pos.x, pos.y, mirror ? -size.x : size.x, size.y, angle, uvX + shrinkTilesX_1, uvY + shrinkTilesY_1, uvX - shrinkTilesX_1 + uvSizeX, uvY - shrinkTilesX_1 + uvSizeY, color.rgbaInt(), additiveColor.rgbaInt());
        }
    }
    else {
        // normal canvas 2D rendering method (slower)
        drawCanvas2D(pos, size, angle, mirror, function (context) {
            if (tileIndex < 0) {
                // if negative tile index, force untextured
                context.fillStyle = color.rgba();
                context.fillRect(-.5, -.5, 1, 1);
            }
            else {
                // calculate uvs and render
                var cols = tileImage.width / tileSize.x | 0;
                var sX = (tileIndex % cols) * tileSize.x + tileBleedShrinkFix;
                var sY = (tileIndex / cols | 0) * tileSize.y + tileBleedShrinkFix;
                var sWidth = tileSize.x - 2 * tileBleedShrinkFix;
                var sHeight = tileSize.y - 2 * tileBleedShrinkFix;
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
function drawRect(pos, size, color, angle) {
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
function drawTileScreenSpace(pos, size, tileIndex, tileSize, color, angle, mirror, additiveColor) {
    if (size === void 0) { size = vec2(1); }
    drawTile(screenToWorld(pos), size.scale(1 / cameraScale), tileIndex, tileSize, color, angle, mirror, additiveColor);
}
/** Draw colored untextured rectangle in screen space
 *  @param {Vector2} pos
 *  @param {Vector2} [size=new Vector2(1,1)]
 *  @param {Color}   [color=new Color(1,1,1)]
 *  @param {Number}  [angle=0]
 *  @memberof Draw */
function drawRectScreenSpace(pos, size, color, angle) {
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 8 arguments, but got 6.
    drawTileScreenSpace(pos, size, -1, defaultTileSize, color, angle);
}
/** Draw colored line between two points
 *  @param {Vector2} posA
 *  @param {Vector2} posB
 *  @param {Number}  [thickness=.1]
 *  @param {Color}   [color=new Color(1,1,1)]
 *  @memberof Draw */
function drawLine(posA, posB, thickness, color) {
    if (thickness === void 0) { thickness = .1; }
    var halfDelta = vec2((posB.x - posA.x) / 2, (posB.y - posA.y) / 2);
    var size = vec2(thickness, halfDelta.length() * 2);
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
function drawCanvas2D(pos, size, angle, mirror, drawFunction, context) {
    if (context === void 0) { context = mainContext; }
    // create canvas transform from world space to screen space
    pos = worldToScreen(pos);
    size = size.scale(cameraScale);
    context.save();
    context.translate(pos.x + .5 | 0, pos.y - .5 | 0);
    context.rotate(angle);
    context.scale(mirror ? -size.x : size.x, size.y);
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
function drawText(text, pos, size, color, lineWidth, lineColor, textAlign, font) {
    if (size === void 0) { size = 1; }
    if (color === void 0) { color = new Color; }
    if (lineWidth === void 0) { lineWidth = 0; }
    if (lineColor === void 0) { lineColor = new Color(0, 0, 0); }
    if (textAlign === void 0) { textAlign = 'center'; }
    if (font === void 0) { font = defaultFont; }
    pos = worldToScreen(pos);
    overlayContext.font = size * cameraScale + 'px ' + font;
    overlayContext.textAlign = textAlign;
    overlayContext.textBaseline = 'middle';
    if (lineWidth) {
        overlayContext.lineWidth = lineWidth * cameraScale;
        overlayContext.strokeStyle = lineColor.rgba();
        overlayContext.strokeText(text, pos.x, pos.y);
    }
    overlayContext.fillStyle = color.rgba();
    overlayContext.fillText(text, pos.x, pos.y);
}
/** Enable additive or regular blend mode
 *  @param {Boolean} [additive=0]
 *  @memberof Draw */
function setBlendMode(additive) {
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
var isFullscreen = function () { return document.fullscreenElement; };
/** Toggle fullsceen mode
 *  @memberof Draw */
function toggleFullscreen() {
    if (isFullscreen()) {
        if (document.exitFullscreen)
            document.exitFullscreen();
        // @ts-expect-error ts-migrate(2339) FIXME: Property 'mozCancelFullScreen' does not exist on t... Remove this comment to see the full error message
        else if (document.mozCancelFullScreen)
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'mozCancelFullScreen' does not exist on t... Remove this comment to see the full error message
            document.mozCancelFullScreen();
    }
    else {
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
/** Returns true if device key is down
 *  @param {Number} key
 *  @param {Number} [device=0]
 *  @return {Boolean}
 *  @memberof Input */
var keyIsDown = function (key, device) {
    if (device === void 0) { device = 0; }
    return inputData[device] && inputData[device][key] & 1 ? 1 : 0;
};
/** Returns true if device key was pressed this frame
 *  @param {Number} key
 *  @param {Number} [device=0]
 *  @return {Boolean}
 *  @memberof Input */
var keyWasPressed = function (key, device) {
    if (device === void 0) { device = 0; }
    return inputData[device] && inputData[device][key] & 2 ? 1 : 0;
};
/** Returns true if device key was released this frame
 *  @param {Number} key
 *  @param {Number} [device=0]
 *  @return {Boolean}
 *  @memberof Input */
var keyWasReleased = function (key, device) {
    if (device === void 0) { device = 0; }
    return inputData[device] && inputData[device][key] & 4 ? 1 : 0;
};
/** Clears all input
 *  @memberof Input */
var clearInput = function () { return inputData[0] = []; };
/** Returns true if mouse button is down
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
var mouseIsDown = keyIsDown;
/** Returns true if mouse button was pressed
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
var mouseWasPressed = keyWasPressed;
/** Returns true if mouse button was released
 *  @param {Number} button
 *  @return {Boolean}
 *  @memberof Input */
var mouseWasReleased = keyWasReleased;
/** Mouse pos in world space
 *  @type {Vector2}
 *  @memberof Input */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 0.
var mousePos = vec2();
/** Mouse pos in screen space
 *  @type {Vector2}
 *  @memberof Input */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 0.
var mousePosScreen = vec2();
/** Mouse wheel delta this frame
 *  @memberof Input */
var mouseWheel = 0;
/** Returns true if user is using gamepad (has more recently pressed a gamepad button)
 *  @memberof Input */
var usingGamepad = 0;
/** Returns true if gamepad button is down
 *  @param {Number} button
 *  @param {Number} [gamepad=0]
 *  @return {Boolean}
 *  @memberof Input */
var gamepadIsDown = function (button, gamepad) {
    if (gamepad === void 0) { gamepad = 0; }
    return keyIsDown(button, gamepad + 1);
};
/** Returns true if gamepad button was pressed
 *  @param {Number} button
 *  @param {Number} [gamepad=0]
 *  @return {Boolean}
 *  @memberof Input */
var gamepadWasPressed = function (button, gamepad) {
    if (gamepad === void 0) { gamepad = 0; }
    return keyWasPressed(button, gamepad + 1);
};
/** Returns true if gamepad button was released
 *  @param {Number} button
 *  @param {Number} [gamepad=0]
 *  @return {Boolean}
 *  @memberof Input */
var gamepadWasReleased = function (button, gamepad) {
    if (gamepad === void 0) { gamepad = 0; }
    return keyWasReleased(button, gamepad + 1);
};
/** Returns gamepad stick value
 *  @param {Number} stick
 *  @param {Number} [gamepad=0]
 *  @return {Vector2}
 *  @memberof Input */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 0.
var gamepadStick = function (stick, gamepad) {
    if (gamepad === void 0) { gamepad = 0; }
    return stickData[gamepad] ? stickData[gamepad][stick] || vec2() : vec2();
};
///////////////////////////////////////////////////////////////////////////////
// Input update called by engine
var inputData = [[]];
function inputUpdate() {
    // clear input when lost focus (prevent stuck keys)
    document.hasFocus() || clearInput();
    // update mouse world space position
    mousePos = screenToWorld(mousePosScreen);
    // update gamepads if enabled
    gamepadsUpdate();
}
function inputUpdatePost() {
    // clear input to prepare for next frame
    for (var _i = 0, inputData_1 = inputData; _i < inputData_1.length; _i++) {
        var deviceInputData = inputData_1[_i];
        for (var i in deviceInputData)
            // @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'never'.
            deviceInputData[i] &= 1;
    }
    mouseWheel = 0;
}
///////////////////////////////////////////////////////////////////////////////
// Keyboard event handlers
onkeydown = function (e) {
    if (debug && e.target != document.body)
        return;
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'never'.
    e.repeat || (inputData[usingGamepad = 0][remapKeyCode(e.keyCode)] = 3);
    debug || e.preventDefault();
};
onkeyup = function (e) {
    if (debug && e.target != document.body)
        return;
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'never'.
    inputData[0][remapKeyCode(e.keyCode)] = 4;
};
var remapKeyCode = function (c) { return copyWASDToDpad ? c == 87 ? 38 : c == 83 ? 40 : c == 65 ? 37 : c == 68 ? 39 : c : c; };
///////////////////////////////////////////////////////////////////////////////
// Mouse event handlers
// @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'never'.
onmousedown = function (e) { inputData[usingGamepad = 0][e.button] = 3; onmousemove(e); e.button && e.preventDefault(); };
// @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'never'.
onmouseup = function (e) { return inputData[0][e.button] = inputData[0][e.button] & 2 | 4; };
onmousemove = function (e) {
    // convert mouse pos to canvas space
    if (!mainCanvas)
        return;
    var rect = mainCanvas.getBoundingClientRect();
    mousePosScreen.x = mainCanvasSize.x * percent(e.x, rect.right, rect.left);
    mousePosScreen.y = mainCanvasSize.y * percent(e.y, rect.bottom, rect.top);
};
onwheel = function (e) { return e.ctrlKey || (mouseWheel = sign(e.deltaY)); };
oncontextmenu = function (e) { return !1; }; // prevent right click menu
///////////////////////////////////////////////////////////////////////////////
// Gamepad input
var stickData = [];
function gamepadsUpdate() {
    if (!gamepadsEnable || !navigator.getGamepads || !document.hasFocus() && !debug)
        return;
    // poll gamepads
    var gamepads = navigator.getGamepads();
    var _loop_2 = function (i) {
        // get or create gamepad data
        var gamepad = gamepads[i];
        var data = inputData[i + 1] || (inputData[i + 1] = []);
        var sticks = stickData[i] || (stickData[i] = []);
        if (gamepad) {
            // read clamp dead zone of analog sticks
            var deadZone_1 = .3, deadZoneMax_1 = .8;
            var applyDeadZone = function (v) { return v > deadZone_1 ? percent(v, deadZoneMax_1, deadZone_1) :
                v < -deadZone_1 ? -percent(-v, deadZoneMax_1, deadZone_1) : 0; };
            // read analog sticks
            for (var j = 0; j < gamepad.axes.length - 1; j += 2)
                sticks[j >> 1] = vec2(applyDeadZone(gamepad.axes[j]), applyDeadZone(-gamepad.axes[j + 1])).clampLength();
            // read buttons
            for (var j = gamepad.buttons.length; j--;) {
                var button = gamepad.buttons[j];
                // @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'never'.
                data[j] = button.pressed ? 1 + 2 * !gamepadIsDown(j, i) : 4 * gamepadIsDown(j, i);
                // @ts-expect-error ts-migrate(2363) FIXME: The right-hand side of an arithmetic operation mus... Remove this comment to see the full error message
                usingGamepad |= !i && button.pressed;
            }
            if (copyGamepadDirectionToStick) {
                // copy dpad to left analog stick when pressed
                var dpad = vec2(gamepadIsDown(15, i) - gamepadIsDown(14, i), gamepadIsDown(12, i) - gamepadIsDown(13, i));
                if (dpad.lengthSquared())
                    sticks[0] = dpad.clampLength();
            }
        }
    };
    for (var i = gamepads.length; i--;) {
        _loop_2(i);
    }
}
///////////////////////////////////////////////////////////////////////////////
// Touch input
/** True if a touch device has been detected
 *  @const {boolean}
 *  @memberof Input */
var isTouchDevice = touchInputEnable && window.ontouchstart !== undefined;
if (isTouchDevice) {
    // handle all touch events the same way
    var wasTouching_1, hadTouchInput_1;
    ontouchstart = ontouchmove = ontouchend = function (e) {
        // @ts-expect-error ts-migrate(2339) FIXME: Property 'button' does not exist on type 'TouchEve... Remove this comment to see the full error message
        e.button = 0; // all touches are left click
        // check if touching and pass to mouse events
        var touching = e.touches.length;
        if (touching) {
            hadTouchInput_1 || zzfx(0, hadTouchInput_1 = 1); // fix mobile audio, force it to play a sound the first time
            // set event pos and pass it along
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'x' does not exist on type 'TouchEvent'.
            e.x = e.touches[0].clientX;
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'y' does not exist on type 'TouchEvent'.
            e.y = e.touches[0].clientY;
            // @ts-expect-error ts-migrate(2721) FIXME: Cannot invoke an object which is possibly 'null'.
            wasTouching_1 ? onmousemove(e) : onmousedown(e);
        }
        else if (wasTouching_1)
            // @ts-expect-error ts-migrate(2721) FIXME: Cannot invoke an object which is possibly 'null'.
            onmouseup(e);
        // set was touching
        wasTouching_1 = touching;
        // prevent normal mouse events from being called
        return !e.cancelable;
    };
}
/** List of all medals
 *  @memberof Medals */
var medals = [];
/** Set to stop medals from being unlockable (like if cheats are enabled)
 *  @memberof Medals */
var medalsPreventUnlock;
/** This can used to enable Newgrounds functionality
 *  @type {Newgrounds}
 *  @memberof Medals */
var newgrounds;
// Engine internal variables not exposed to documentation
var medalsDisplayQueue = [], medalsSaveName, medalsDisplayTimer;
///////////////////////////////////////////////////////////////////////////////
/** Initialize medals with a save name used for storage
 *  <br> - Checks if medals are unlocked
 *  <br> - Call this after creating all medals
 *  @param {String} saveName
 *  @memberof Medals */
function medalsInit(saveName) {
    // check if medals are unlocked
    medalsSaveName: any = saveName;
    debugMedals || medals.forEach(function (medal) { return medal.unlocked = localStorage[medal.storageKey()]; });
}
/** Medal Object - Tracks an unlockable medal */
var Medal = /** @class */ (function () {
    /**
     * Create an medal object and adds it to the list of medals
     * @param {Number} id - The unique identifier of the medal
     * @param {String} name - Name of the medal
     * @param {String} [description] - Description of the medal
     * @param {String} [icon='🏆'] - Icon for the medal
     * @param {String} [src] - Image location for the medal
     */
    function Medal(id, name, description, icon, src) {
        if (description === void 0) { description = ''; }
        if (icon === void 0) { icon = '🏆'; }
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
        ASSERT(id >= 0 && !medals[id]);
        // save attributes and add to list of medals
        medals[this.id = id] = this;
        this.name = name;
        this.description = description;
        this.icon = icon;
        if (src) {
            // load image
            this.image = new Image();
            this.image.src = src;
        }
    }
    /** Unlocks a medal if not already unlocked */
    Medal.prototype.unlock = function () {
        if (medalsPreventUnlock || this.unlocked)
            return;
        // save the medal
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
        ASSERT(medalsSaveName); // game name must be set
        localStorage[this.storageKey()] = this.unlocked = 1;
        medalsDisplayQueue.push(this);
        // save for newgrounds and OS13K
        newgrounds && newgrounds.unlockMedal(this.id);
        localStorage['OS13kTrophy,' + this.icon + ',' + medalsSaveName + ',' + this.name] = this.description;
    };
    /** Render a medal
     *  @param {Number} [hidePercent=0] - How much to slide the medal off screen
     */
    Medal.prototype.render = function (hidePercent) {
        if (hidePercent === void 0) { hidePercent = 0; }
        var context = overlayContext;
        var x = overlayCanvas.width - medalDisplayWidth;
        var y = -medalDisplayHeight * hidePercent;
        // draw containing rect and clip to that region
        context.save();
        context.beginPath();
        context.fillStyle = '#ddd';
        context.fill(context.rect(x, y, medalDisplayWidth, medalDisplayHeight));
        context.strokeStyle = context.fillStyle = '#000';
        context.lineWidth = 2;
        context.stroke();
        context.clip();
        this.renderIcon(x + 15 + medalDisplayIconSize / 2, y + medalDisplayHeight / 2);
        // draw the text
        context.textAlign = 'left';
        context.font = '3em ' + defaultFont;
        context.fillText(this.name, x + medalDisplayIconSize + 25, y + 35);
        context.font = '1.5em ' + defaultFont;
        context.restore(context.fillText(this.description, x + medalDisplayIconSize + 25, y + 70));
    };
    /** Render the icon for a medal
     *  @param {Number} x - Screen space X position
     *  @param {Number} y - Screen space Y position
     *  @param {Number} [size=medalDisplayIconSize] - Screen space size
     */
    Medal.prototype.renderIcon = function (x, y, size) {
        if (size === void 0) { size = medalDisplayIconSize; }
        // draw the image or icon
        var context = overlayContext;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = size * .6 + 'px ' + defaultFont;
        context.fillStyle = '#000';
        if (this.image)
            context.drawImage(this.image, x - size / 2, y - size / 2, size, size);
        else
            context.fillText(this.icon, x, y); // show icon if there is no image
    };
    // Get local storage key used by the medal
    Medal.prototype.storageKey = function () {
        return medalsSaveName + '_medal_' + this.id;
    };
    return Medal;
}());
// engine automatically renders medals
function medalsRender() {
    if (!medalsDisplayQueue.length)
        return;
    // update first medal in queue
    var medal = medalsDisplayQueue[0];
    var time = timeReal - medalsDisplayTimer;
    if (!medalsDisplayTimer)
        medalsDisplayTimer = timeReal;
    else if (time > medalDisplayTime)
        medalsDisplayQueue.shift(medalsDisplayTimer = 0);
    else {
        // slide on/off medals
        var slideOffTime = medalDisplayTime - medalDisplaySlideTime;
        var hidePercent = time < medalDisplaySlideTime ? 1 - time / medalDisplaySlideTime :
            time > slideOffTime ? (time - slideOffTime) / medalDisplaySlideTime : 0;
        medal.render(hidePercent);
    }
}
///////////////////////////////////////////////////////////////////////////////
/** Newgrounds API wrapper object */
var Newgrounds = /** @class */ (function () {
    /**
     * Create a newgrounds object
     * @param {Number} app_id - The newgrounds App ID
     * @param {String} [cipher] - The encryption Key (AES-128/Base64)
     */
    function Newgrounds(app_id, cipher) {
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
        ASSERT(!newgrounds && app_id);
        this.app_id = app_id;
        this.cipher = cipher;
        this.host = location ? location.hostname : '';
        // create an instance of CryptoJS for encrypted calls
        cipher && (this.cryptoJS = CryptoJS());
        // get session id from url search params
        var url = new URL(window.location.href);
        this.session_id = url.searchParams.get('ngio_session_id') || 0;
        if (this.session_id == 0)
            return; // only use newgrounds when logged in
        // get medals
        var medalsResult = this.call('Medal.getList');
        this.medals = medalsResult ? medalsResult.result.data['medals'] : [];
        debugMedals && console.log(this.medals);
        for (var _i = 0, _a = this.medals; _i < _a.length; _i++) {
            var newgroundsMedal = _a[_i];
            var medal = medals[newgroundsMedal['id']];
            if (medal) {
                // copy newgrounds medal data
                medal.image = new Image();
                medal.image.src = newgroundsMedal['icon'];
                medal.name = newgroundsMedal['name'];
                medal.description = newgroundsMedal['description'];
                medal.unlocked = newgroundsMedal['unlocked'];
                medal.difficulty = newgroundsMedal['difficulty'];
                medal.value = newgroundsMedal['value'];
                if (medal.value)
                    medal.description = medal.description + ' (' + medal.value + ')';
            }
        }
        // get scoreboards
        var scoreboardResult = this.call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult ? scoreboardResult.result.data.scoreboards : [];
        debugMedals && console.log(this.scoreboards);
    }
    /** Send message to unlock a medal by id
     * @param {Number} id - The medal id */
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ id: any; }' is not assignable ... Remove this comment to see the full error message
    Newgrounds.prototype.unlockMedal = function (id) { return this.call('Medal.unlock', { 'id': id }, 1); };
    /** Send message to post score
     * @param {Number} id - The scoreboard id
     * @param {Number} value - The score value */
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ id: any; value: any; }' is not... Remove this comment to see the full error message
    Newgrounds.prototype.postScore = function (id, value) { return this.call('ScoreBoard.postScore', { 'id': id, 'value': value }, 1); };
    /** Send message to log a view */
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ host: any; }' is not assignabl... Remove this comment to see the full error message
    Newgrounds.prototype.logView = function () { return this.call('App.logView', { 'host': this.host }, 1); };
    /** Get scores from a scoreboard
     * @param {Number} id - The scoreboard id
     * @param {String} [user=0] - A user's id or name
     * @param {Number} [social=0] - If true, only social scores will be loaded
     * @param {Number} [skip=0] - Number of scores to skip before start
     * @param {Number} [limit=10] - Number of scores to include in the list
     * @return {Object} - The response JSON object
     */
    Newgrounds.prototype.getScores = function (id, user, social, skip, limit) {
        if (user === void 0) { user = 0; }
        if (social === void 0) { social = 0; }
        if (skip === void 0) { skip = 0; }
        if (limit === void 0) { limit = 10; }
        return this.call('ScoreBoard.getScores', { 'id': id, 'user': user, 'social': social, 'skip': skip, 'limit': limit });
    };
    /** Send a message to call a component of the Newgrounds API
     * @param {String}  component - Name of the component
     * @param {Object}  [parameters=0] - Parameters to use for call
     * @param {Boolean} [async=0] - If true, wait for response before continuing (will cause stall)
     * @return {Object} - The response JSON object
     */
    Newgrounds.prototype.call = function (component, parameters, async) {
        if (parameters === void 0) { parameters = 0; }
        if (async === void 0) { async = 0; }
        var call = { 'component': component, 'parameters': parameters };
        if (this.cipher) {
            // encrypt using AES-128 Base64 with cryptoJS
            var cryptoJS = this.cryptoJS;
            var aesKey = cryptoJS['enc']['Base64']['parse'](this.cipher);
            var iv = cryptoJS['lib']['WordArray']['random'](16);
            var encrypted = cryptoJS['AES']['encrypt'](JSON.stringify(call), aesKey, { 'iv': iv });
            // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            call['secure'] = cryptoJS['enc']['Base64']['stringify'](iv.concat(encrypted['ciphertext']));
            call['parameters'] = 0;
        }
        // build the input object
        var input = {
            'app_id': this.app_id,
            'session_id': this.session_id,
            'call': call
        };
        // build post data
        var formData = new FormData();
        formData.append('input', JSON.stringify(input));
        // send post data
        var xmlHttp = new XMLHttpRequest();
        var url = 'https://newgrounds.io/gateway_v3.php';
        // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
        xmlHttp.open('POST', url, !debugMedals && async);
        xmlHttp.send(formData);
        debugMedals && console.log(xmlHttp.responseText);
        return xmlHttp.responseText && JSON.parse(xmlHttp.responseText);
    };
    return Newgrounds;
}());
///////////////////////////////////////////////////////////////////////////////
// Crypto-JS - https://github.com/brix/crypto-js [The MIT License (MIT)]
// Copyright (c) 2009-2013 Jeff Mott  Copyright (c) 2013-2016 Evan Vosberg
// @ts-expect-error ts-migrate(2461) FIXME: Type '"]charCodeAtUinyxpf"' is not an array type.
var CryptoJS = function () { return eval(Function.apply(void 0, __spreadArray(__spreadArray(["[M='GBMGXz^oVYPPKKbB`agTXU|LxPc_ZBcMrZvCr~wyGfWrwk@ATqlqeTp^N?p{we}jIpEnB_sEr`l?YDkDhWhprc|Er|XETG?pTl`e}dIc[_N~}fzRycIfpW{HTolvoPB_FMe_eH~BTMx]yyOhv?biWPCGc]kABencBhgERHGf{OL`Dj`c^sh@canhy[secghiyotcdOWgO{tJIE^JtdGQRNSCrwKYciZOa]Y@tcRATYKzv|sXpboHcbCBf`}SKeXPFM|RiJsSNaIb]QPc[D]Jy_O^XkOVTZep`ONmntLL`Qz~UupHBX_Ia~WX]yTRJIxG`ioZ{fefLJFhdyYoyLPvqgH?b`[TMnTwwfzDXhfM?rKs^aFr|nyBdPmVHTtAjXoYUloEziWDCw_suyYT~lSMksI~ZNCS[Bex~j]Vz?kx`gdYSEMCsHpjbyxQvw|XxX_^nQYue{sBzVWQKYndtYQMWRef{bOHSfQhiNdtR{o?cUAHQAABThwHPT}F{VvFmgN`E@FiFYS`UJmpQNM`X|tPKHlccT}z}k{sACHL?Rt@MkWplxO`ASgh?hBsuuP|xD~LSH~KBlRs]t|l|_tQAroDRqWS^SEr[sYdPB}TAROtW{mIkE|dWOuLgLmJrucGLpebrAFKWjikTUzS|j}M}szasKOmrjy[?hpwnEfX[jGpLt@^v_eNwSQHNwtOtDgWD{rk|UgASs@mziIXrsHN_|hZuxXlPJOsA^^?QY^yGoCBx{ekLuZzRqQZdsNSx@ezDAn{XNj@fRXIwrDX?{ZQHwTEfu@GhxDOykqts|n{jOeZ@c`dvTY?e^]ATvWpb?SVyg]GC?SlzteilZJAL]mlhLjYZazY__qcVFYvt@|bIQnSno@OXyt]OulzkWqH`rYFWrwGs`v|~XeTsIssLrbmHZCYHiJrX}eEzSssH}]l]IhPQhPoQ}rCXLyhFIT[clhzYOvyHqigxmjz`phKUU^TPf[GRAIhNqSOdayFP@FmKmuIzMOeoqdpxyCOwCthcLq?n`L`tLIBboNn~uXeFcPE{C~mC`h]jUUUQe^`UqvzCutYCgct|SBrAeiYQW?X~KzCz}guXbsUw?pLsg@hDArw?KeJD[BN?GD@wgFWCiHq@Ypp_QKFixEKWqRp]oJFuVIEvjDcTFu~Zz]a{IcXhWuIdMQjJ]lwmGQ|]g~c]Hl]pl`Pd^?loIcsoNir_kikBYyg?NarXZEGYspt_vLBIoj}LI[uBFvm}tbqvC|xyR~a{kob|HlctZslTGtPDhBKsNsoZPuH`U`Fqg{gKnGSHVLJ^O`zmNgMn~{rsQuoymw^JY?iUBvw_~mMr|GrPHTERS[MiNpY[Mm{ggHpzRaJaoFomtdaQ_?xuTRm}@KjU~RtPsAdxa|uHmy}n^i||FVL[eQAPrWfLm^ndczgF~Nk~aplQvTUpHvnTya]kOenZlLAQIm{lPl@CCTchvCF[fI{^zPkeYZTiamoEcKmBMfZhk_j_~Fjp|wPVZlkh_nHu]@tP|hS@^G^PdsQ~f[RqgTDqezxNFcaO}HZhb|MMiNSYSAnQWCDJukT~e|OTgc}sf[cnr?fyzTa|EwEtRG|I~|IO}O]S|rp]CQ}}DWhSjC_|z|oY|FYl@WkCOoPuWuqr{fJu?Brs^_EBI[@_OCKs}?]O`jnDiXBvaIWhhMAQDNb{U`bqVR}oqVAvR@AZHEBY@depD]OLh`kf^UsHhzKT}CS}HQKy}Q~AeMydXPQztWSSzDnghULQgMAmbWIZ|lWWeEXrE^EeNoZApooEmrXe{NAnoDf`m}UNlRdqQ@jOc~HLOMWs]IDqJHYoMziEedGBPOxOb?[X`KxkFRg@`mgFYnP{hSaxwZfBQqTm}_?RSEaQga]w[vxc]hMne}VfSlqUeMo_iqmd`ilnJXnhdj^EEFifvZyxYFRf^VaqBhLyrGlk~qowqzHOBlOwtx?i{m~`n^G?Yxzxux}b{LSlx]dS~thO^lYE}bzKmUEzwW^{rPGhbEov[Plv??xtyKJshbG`KuO?hjBdS@Ru}iGpvFXJRrvOlrKN?`I_n_tplk}kgwSXuKylXbRQ]]?a|{xiT[li?k]CJpwy^o@ebyGQrPfF`aszGKp]baIx~H?ElETtFh]dz[OjGl@C?]VDhr}OE@V]wLTc[WErXacM{We`F|utKKjgllAxvsVYBZ@HcuMgLboFHVZmi}eIXAIFhS@A@FGRbjeoJWZ_NKd^oEH`qgy`q[Tq{x?LRP|GfBFFJV|fgZs`MLbpPYUdIV^]mD@FG]pYAT^A^RNCcXVrPsgk{jTrAIQPs_`mD}rOqAZA[}RETFz]WkXFTz_m{N@{W@_fPKZLT`@aIqf|L^Mb|crNqZ{BVsijzpGPEKQQZGlApDn`ruH}cvF|iXcNqK}cxe_U~HRnKV}sCYb`D~oGvwG[Ca|UaybXea~DdD~LiIbGRxJ_VGheI{ika}KC[OZJLn^IBkPrQj_EuoFwZ}DpoBRcK]Q}?EmTv~i_Tul{bky?Iit~tgS|o}JL_VYcCQdjeJ_MfaA`FgCgc[Ii|CBHwq~nbJeYTK{e`CNstKfTKPzw{jdhp|qsZyP_FcugxCFNpKitlR~vUrx^NrSVsSTaEgnxZTmKc`R|lGJeX}ccKLsQZQhsFkeFd|ckHIVTlGMg`~uPwuHRJS_CPuN_ogXe{Ba}dO_UBhuNXby|h?JlgBIqMKx^_u{molgL[W_iavNQuOq?ap]PGB`clAicnl@k~pA?MWHEZ{HuTLsCpOxxrKlBh]FyMjLdFl|nMIvTHyGAlPogqfZ?PlvlFJvYnDQd}R@uAhtJmDfe|iJqdkYr}r@mEjjIetDl_I`TELfoR|qTBu@Tic[BaXjP?dCS~MUK[HPRI}OUOwAaf|_}HZzrwXvbnNgltjTwkBE~MztTQhtRSWoQHajMoVyBBA`kdgK~h`o[J`dm~pm]tk@i`[F~F]DBlJKklrkR]SNw@{aG~Vhl`KINsQkOy?WhcqUMTGDOM_]bUjVd|Yh_KUCCgIJ|LDIGZCPls{RzbVWVLEhHvWBzKq|^N?DyJB|__aCUjoEgsARki}j@DQXS`RNU|DJ^a~d{sh_Iu{ONcUtSrGWW@cvUjefHHi}eSSGrNtO?cTPBShLqzwMVjWQQCCFB^culBjZHEK_{dO~Q`YhJYFn]jq~XSnG@[lQr]eKrjXpG~L^h~tDgEma^AUFThlaR{xyuP@[^VFwXSeUbVetufa@dX]CLyAnDV@Bs[DnpeghJw^?UIana}r_CKGDySoRudklbgio}kIDpA@McDoPK?iYcG?_zOmnWfJp}a[JLR[stXMo?_^Ng[whQlrDbrawZeSZ~SJstIObdDSfAA{MV}?gNunLOnbMv_~KFQUAjIMj^GkoGxuYtYbGDImEYiwEMyTpMxN_LSnSMdl{bg@dtAnAMvhDTBR_FxoQgANniRqxd`pWv@rFJ|mWNWmh[GMJz_Nq`BIN@KsjMPASXORcdHjf~rJfgZYe_uulzqM_KdPlMsuvU^YJuLtofPhGonVOQxCMuXliNvJIaoC?hSxcxKVVxWlNs^ENDvCtSmO~WxI[itnjs^RDvI@KqG}YekaSbTaB]ki]XM@[ZnDAP~@|BzLRgOzmjmPkRE@_sobkT|SszXK[rZN?F]Z_u}Yue^[BZgLtR}FHzWyxWEX^wXC]MJmiVbQuBzkgRcKGUhOvUc_bga|Tx`KEM`JWEgTpFYVeXLCm|mctZR@uKTDeUONPozBeIkrY`cz]]~WPGMUf`MNUGHDbxZuO{gmsKYkAGRPqjc|_FtblEOwy}dnwCHo]PJhN~JoteaJ?dmYZeB^Xd?X^pOKDbOMF@Ugg^hETLdhwlA}PL@_ur|o{VZosP?ntJ_kG][g{Zq`Tu]dzQlSWiKfnxDnk}KOzp~tdFstMobmy[oPYjyOtUzMWdjcNSUAjRuqhLS@AwB^{BFnqjCmmlk?jpn}TksS{KcKkDboXiwK]qMVjm~V`LgWhjS^nLGwfhAYrjDSBL_{cRus~{?xar_xqPlArrYFd?pHKdMEZzzjJpfC?Hv}mAuIDkyBxFpxhstTx`IO{rp}XGuQ]VtbHerlRc_LFGWK[XluFcNGUtDYMZny[M^nVKVeMllQI[xtvwQnXFlWYqxZZFp_|]^oWX[{pOMpxXxvkbyJA[DrPzwD|LW|QcV{Nw~U^dgguSpG]ClmO@j_TENIGjPWwgdVbHganhM?ema|dBaqla|WBd`poj~klxaasKxGG^xbWquAl~_lKWxUkDFagMnE{zHug{b`A~IYcQYBF_E}wiA}K@yxWHrZ{[d~|ARsYsjeNWzkMs~IOqqp[yzDE|WFrivsidTcnbHFRoW@XpAV`lv_zj?B~tPCppRjgbbDTALeFaOf?VcjnKTQMLyp{NwdylHCqmo?oelhjWuXj~}{fpuX`fra?GNkDiChYgVSh{R[BgF~eQa^WVz}ATI_CpY?g_diae]|ijH`TyNIF}|D_xpmBq_JpKih{Ba|sWzhnAoyraiDvk`h{qbBfsylBGmRH}DRPdryEsSaKS~tIaeF[s]I~xxHVrcNe@Jjxa@jlhZueLQqHh_]twVMqG_EGuwyab{nxOF?`HCle}nBZzlTQjkLmoXbXhOtBglFoMz?eqre`HiE@vNwBulglmQjj]DB@pPkPUgA^sjOAUNdSu_`oAzar?n?eMnw{{hYmslYi[TnlJD'"], ']charCodeAtUinyxpf', false), ["for(;e<10359;c[e++]=p-=128,A=A?p-A&&A:p==34&&p)for(p=1;p<128;y=f.map((n,x)=>(U=r[n]*2+1,U=Math.log(U/(h-U)),t-=a[x]*U,U/500)),t=~-h/(1+Math.exp(t))|1,i=o%h<t,o=o%h+(i?t:h-t)*(o>>17)-!i*t,f.map((n,x)=>(U=r[n]+=(i*h/2-r[n]<<13)/((C[n]+=C[n]<5)+1/20)>>13,a[x]+=y[x]*(i-t/h))),p=p*2+i)for(f='010202103203210431053105410642065206541'.split(t=0).map((n,x)=>(U=0,[...n].map((n,x)=>(U=U*997+(c[e-n]|0)|0)),h*32-1&U*997+p+!!A*129)*12+x);o<h*32;o=o*64|M.charCodeAt(d++)&63);for(C=String.fromCharCode(...c);r=/[\0-#?@\\\\~]/.exec(C);)with(C.split(r))C=join(shift());return C"], false))([], [], 1 << 17, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], new Uint16Array(51e6).fill(1 << 15), new Uint8Array(51e6), 0, 0, 0, 0)); };
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
// @ts-expect-error ts-migrate(2300) FIXME: Duplicate identifier 'EngineObject'.
var EngineObject = /** @class */ (function () {
    /**
     * Create an engine object and adds it to the list of objects
     * @param {Vector2} [position=new Vector2(0,0)] - World space position of the object
     * @param {Vector2} [size=defaultObjectSize] - World space size of the object
     * @param {Number}  [tileIndex=-1] - Tile to use to render object, untextured if -1
     * @param {Vector2} [tileSize=defaultTileSize] - Size of tile in source pixels
     * @param {Number}  [angle=0] - Angle to rotate the object
     * @param {Color}   [color] - Color to apply to tile when rendered
     */
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 0.
    function EngineObject(pos, size, tileIndex, tileSize, angle, color) {
        // set passed in params
        if (pos === void 0) { pos = vec2(); }
        if (size === void 0) { size = defaultObjectSize; }
        if (tileIndex === void 0) { tileIndex = -1; }
        if (tileSize === void 0) { tileSize = defaultTileSize; }
        if (angle === void 0) { angle = 0; }
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
        ASSERT(pos && pos.x != undefined && size.x != undefined); // ensure pos and size are vec2s
        this.pos = pos.copy();
        this.size = size;
        this.tileIndex = tileIndex;
        this.tileSize = tileSize;
        this.angle = angle;
        this.color = color;
        // set physics defaults
        this.mass = defaultObjectMass;
        this.damping = defaultObjectDamping;
        this.angleDamping = defaultObjectAngleDamping;
        this.elasticity = defaultObjectElasticity;
        this.friction = defaultObjectFriction;
        // init other object stuff
        this.spawnTime = time;
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
        this.velocity = vec2(this.collideSolidObjects = this.renderOrder = this.angleVelocity = 0);
        this.collideTiles = this.gravityScale = 1;
        this.children = [];
        // add to list of objects
        engineObjects.push(this);
    }
    /** Update the object transform and physics, called automatically by engine once each frame */
    EngineObject.prototype.update = function () {
        var parent = this.parent;
        if (parent) {
            // copy parent pos/angle
            this.pos = this.localPos.multiply(vec2(parent.getMirrorSign(), 1)).rotate(-parent.angle).add(parent.pos);
            this.angle = parent.getMirrorSign() * this.localAngle + parent.angle;
            return;
        }
        // limit max speed to prevent missing collisions
        this.velocity.x = clamp(this.velocity.x, maxObjectSpeed, -maxObjectSpeed);
        this.velocity.y = clamp(this.velocity.y, maxObjectSpeed, -maxObjectSpeed);
        // apply physics
        var oldPos = this.pos.copy();
        this.pos.x += this.velocity.x = this.damping * this.velocity.x;
        this.pos.y += this.velocity.y = this.damping * this.velocity.y + gravity * this.gravityScale;
        this.angle += this.angleVelocity *= this.angleDamping;
        // physics sanity checks
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
        ASSERT(this.angleDamping >= 0 && this.angleDamping <= 1);
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
        ASSERT(this.damping >= 0 && this.damping <= 1);
        if (!this.mass) // do not update collision for fixed objects
            return;
        var wasMovingDown = this.velocity.y < 0;
        if (this.groundObject) {
            // apply friction in local space of ground object
            var groundSpeed = this.groundObject.velocity ? this.groundObject.velocity.x : 0;
            this.velocity.x = groundSpeed + (this.velocity.x - groundSpeed) * this.friction;
            this.groundObject = 0;
            //debugPhysics && debugPoint(this.pos.subtract(vec2(0,this.size.y/2)), '#0f0');
        }
        if (this.collideSolidObjects) {
            // check collisions against solid objects
            var epsilon = 1e-3; // necessary to push slightly outside of the collision
            for (var _i = 0, engineCollideObjects_1 = engineCollideObjects; _i < engineCollideObjects_1.length; _i++) {
                var o = engineCollideObjects_1[_i];
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
                if (isOverlapping(oldPos, this.size, o.pos, o.size)) {
                    // if already was touching, try to push away
                    var deltaPos = oldPos.subtract(o.pos);
                    var length_1 = deltaPos.length();
                    var pushAwayAccel = .001; // push away if alread overlapping
                    var velocity = length_1 < .01 ? randVector(pushAwayAccel) : deltaPos.scale(pushAwayAccel / length_1);
                    this.velocity = this.velocity.add(velocity);
                    if (o.mass) // push away if not fixed
                        o.velocity = o.velocity.subtract(velocity);
                    // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 5.
                    debugPhysics && debugAABB(this.pos, this.size, o.pos, o.size, '#f00');
                    continue;
                }
                // check for collision
                var sx = this.size.x + o.size.x;
                var sy = this.size.y + o.size.y;
                var smallStepUp = (oldPos.y - o.pos.y) * 2 > sy + gravity; // prefer to push up if small delta
                var isBlockedX = abs(oldPos.y - o.pos.y) * 2 < sy;
                var isBlockedY = abs(oldPos.x - o.pos.x) * 2 < sx;
                if (smallStepUp || isBlockedY || !isBlockedX) // resolve y collision
                 {
                    // push outside object collision
                    this.pos.y = o.pos.y + (sy / 2 + epsilon) * sign(oldPos.y - o.pos.y);
                    if (o.groundObject && wasMovingDown || !o.mass) {
                        // set ground object if landed on something
                        if (wasMovingDown)
                            this.groundObject = o;
                        // bounce if other object is fixed or grounded
                        this.velocity.y *= -this.elasticity;
                    }
                    else if (o.mass) {
                        // inelastic collision
                        var inelastic = (this.mass * this.velocity.y + o.mass * o.velocity.y) / (this.mass + o.mass);
                        // elastic collision
                        var elastic0 = this.velocity.y * (this.mass - o.mass) / (this.mass + o.mass)
                            + o.velocity.y * 2 * o.mass / (this.mass + o.mass);
                        var elastic1 = o.velocity.y * (o.mass - this.mass) / (this.mass + o.mass)
                            + this.velocity.y * 2 * this.mass / (this.mass + o.mass);
                        // lerp betwen elastic or inelastic based on elasticity
                        var elasticity = max(this.elasticity, o.elasticity);
                        this.velocity.y = lerp(elasticity, elastic0, inelastic);
                        o.velocity.y = lerp(elasticity, elastic1, inelastic);
                    }
                    debugPhysics && smallStepUp && (abs(oldPos.x - o.pos.x) * 2 > sx) && console.log('stepUp', oldPos.y - o.pos.y);
                }
                if (!smallStepUp && (isBlockedX || !isBlockedY)) // resolve x collision
                 {
                    // push outside collision
                    this.pos.x = o.pos.x + (sx / 2 + epsilon) * sign(oldPos.x - o.pos.x);
                    if (o.mass) {
                        // inelastic collision
                        var inelastic = (this.mass * this.velocity.x + o.mass * o.velocity.x) / (this.mass + o.mass);
                        // elastic collision
                        var elastic0 = this.velocity.x * (this.mass - o.mass) / (this.mass + o.mass)
                            + o.velocity.x * 2 * o.mass / (this.mass + o.mass);
                        var elastic1 = o.velocity.x * (o.mass - this.mass) / (this.mass + o.mass)
                            + this.velocity.x * 2 * this.mass / (this.mass + o.mass);
                        // lerp betwen elastic or inelastic based on elasticity
                        var elasticity = max(this.elasticity, o.elasticity);
                        this.velocity.x = lerp(elasticity, elastic0, inelastic);
                        o.velocity.x = lerp(elasticity, elastic1, inelastic);
                    }
                    else // bounce if other object is fixed
                        this.velocity.x *= -this.elasticity;
                }
                // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 5.
                debugPhysics && debugAABB(this.pos, this.size, o.pos, o.size, '#f0f');
            }
        }
        if (this.collideTiles) {
            // check collision against tiles
            if (tileCollisionTest(this.pos, this.size, this)) {
                //debugPhysics && debugRect(this.pos, this.size, '#ff0');
                // if already was stuck in collision, don't do anything
                // this should not happen unless something starts in collision
                if (!tileCollisionTest(oldPos, this.size, this)) {
                    // test which side we bounced off (or both if a corner)
                    var isBlockedY = tileCollisionTest(new Vector2(oldPos.x, this.pos.y), this.size, this);
                    var isBlockedX = tileCollisionTest(new Vector2(this.pos.x, oldPos.y), this.size, this);
                    if (isBlockedY || !isBlockedX) {
                        // set if landed on ground
                        this.groundObject = wasMovingDown;
                        // bounce velocity
                        this.velocity.y *= -this.elasticity;
                        // adjust next velocity to settle on ground
                        var o = (oldPos.y - this.size.y / 2 | 0) - (oldPos.y - this.size.y / 2);
                        if (o < 0 && o > -1 && o > this.damping * this.velocity.y + gravity * this.gravityScale)
                            this.velocity.y = this.damping ? (o - gravity * this.gravityScale) / this.damping : 0;
                        // move to previous position
                        this.pos.y = oldPos.y;
                    }
                    if (isBlockedX) {
                        // move to previous position and bounce
                        this.pos.x = oldPos.x;
                        this.velocity.x *= -this.elasticity;
                    }
                }
            }
        }
    };
    /** Render the object, draws a tile by default, automatically called each frame, sorted by renderOrder */
    EngineObject.prototype.render = function () {
        // default object render
        drawTile(this.pos, this.drawSize || this.size, this.tileIndex, this.tileSize, this.color, this.angle, this.mirror, this.additiveColor);
    };
    /** Destroy this object, destroy it's children, detach it's parent, and mark it for removal */
    EngineObject.prototype.destroy = function () {
        if (this.destroyed)
            return;
        // disconnect from parent and destroy chidren
        this.destroyed = 1;
        this.parent && this.parent.removeChild(this);
        for (var _i = 0, _a = this.children; _i < _a.length; _i++) {
            var child = _a[_i];
            child.destroy(child.parent = 0);
        }
    };
    /** Called to check if a tile collision should be resolved
     *  @param {Number}  tileData - the value of the tile at the position
     *  @param {Vector2} pos - tile where the collision occured
     *  @return {Boolean} true if the collision should be resolved */
    EngineObject.prototype.collideWithTile = function (tileData, pos) { return tileData > 0; };
    /** Called to check if a tile raycast hit
     *  @param {Number}  tileData - the value of the tile at the position
     *  @param {Vector2} pos - tile where the raycast is
     *  @return {Boolean} true if the raycast should hit */
    EngineObject.prototype.collideWithTileRaycast = function (tileData, pos) { return tileData > 0; };
    /** Called to check if a tile raycast hit
     *  @param {EngineObject} object - the object to test against
     *  @return {Boolean} true if the collision should be resolved
     */
    EngineObject.prototype.collideWithObject = function (o) { return 1; };
    /** How long since the object was created
     *  @return {Number} */
    EngineObject.prototype.getAliveTime = function () { return time - this.spawnTime; };
    /** Apply acceleration to this object (adjust velocity, not affected by mass)
     *  @param {Vector2} acceleration */
    EngineObject.prototype.applyAcceleration = function (a) { if (this.mass)
        this.velocity = this.velocity.add(a); };
    /** Apply force to this object (adjust velocity, affected by mass)
     *  @param {Vector2} force */
    EngineObject.prototype.applyForce = function (force) { this.applyAcceleration(force.scale(1 / this.mass)); };
    /** Get the direction of the mirror
     *  @return {Number} -1 if this.mirror is true, or 1 if not mirrored */
    EngineObject.prototype.getMirrorSign = function () { return this.mirror ? -1 : 1; };
    /** Attaches a child to this with a given local transform
     *  @param {EngineObject} child
     *  @param {Vector2}      [localPos=new Vector2]
     *  @param {Number}       [localAngle=0] */
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 0.
    EngineObject.prototype.addChild = function (child, localPos, localAngle) {
        if (localPos === void 0) { localPos = vec2(); }
        if (localAngle === void 0) { localAngle = 0; }
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
        ASSERT(!child.parent && !this.children.includes(child));
        this.children.push(child);
        child.parent = this;
        child.localPos = localPos.copy();
        child.localAngle = localAngle;
    };
    /** Removes a child from this one
     *  @param {EngineObject} child */
    EngineObject.prototype.removeChild = function (child) {
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
        ASSERT(child.parent == this && this.children.includes(child));
        this.children.splice(this.children.indexOf(child), 1);
        child.parent = 0;
    };
    /** Set how this object collides
     *  @param {boolean} [collideSolidObjects=0] - Does it collide with solid objects
     *  @param {boolean} [isSolid=0] - Does it collide with and block other objects (expensive in large numbers)
     *  @param {boolean} [collideTiles=1] - Does it collide with the tile collision */
    EngineObject.prototype.setCollision = function (collideSolidObjects, isSolid, collideTiles) {
        if (collideSolidObjects === void 0) { collideSolidObjects = 0; }
        if (isSolid === void 0) { isSolid = 0; }
        if (collideTiles === void 0) { collideTiles = 1; }
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
        ASSERT(collideSolidObjects || !isSolid); // solid objects must be set to collide
        // track collidable objects in separate list
        if (collideSolidObjects && !this.collideSolidObjects) {
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
            ASSERT(!engineCollideObjects.includes(this));
            engineCollideObjects.push(this);
        }
        else if (!collideSolidObjects && this.collideSolidObjects) {
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 1.
            ASSERT(engineCollideObjects.includes(this));
            engineCollideObjects.splice(engineCollideObjects.indexOf(this), 1);
        }
        this.collideSolidObjects = collideSolidObjects;
        this.isSolid = isSolid;
        this.collideTiles = collideTiles;
    };
    return EngineObject;
}());
/**
 * Particle Emitter - Spawns particles with the given settings
 */
// @ts-expect-error ts-migrate(2300) FIXME: Duplicate identifier 'ParticleEmitter'.
var ParticleEmitter = /** @class */ (function (_super) {
    __extends(ParticleEmitter, _super);
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
    function ParticleEmitter(pos, emitSize, emitTime, emitRate, emitConeAngle, tileIndex, tileSize, colorStartA, colorStartB, colorEndA, colorEndB, particleTime, sizeStart, sizeEnd, speed, angleSpeed, damping, angleDamping, gravityScale, particleConeAngle, fadeRate, randomness, collideTiles, additive, randomColorLinear, renderOrder) {
        if (emitSize === void 0) { emitSize = 0; }
        if (emitTime === void 0) { emitTime = 0; }
        if (emitRate === void 0) { emitRate = 100; }
        if (emitConeAngle === void 0) { emitConeAngle = PI; }
        if (tileIndex === void 0) { tileIndex = -1; }
        if (tileSize === void 0) { tileSize = defaultTileSize; }
        if (colorStartA === void 0) { colorStartA = new Color; }
        if (colorStartB === void 0) { colorStartB = new Color; }
        if (colorEndA === void 0) { colorEndA = new Color(1, 1, 1, 0); }
        if (colorEndB === void 0) { colorEndB = new Color(1, 1, 1, 0); }
        if (particleTime === void 0) { particleTime = .5; }
        if (sizeStart === void 0) { sizeStart = .1; }
        if (sizeEnd === void 0) { sizeEnd = 1; }
        if (speed === void 0) { speed = .1; }
        if (angleSpeed === void 0) { angleSpeed = .05; }
        if (damping === void 0) { damping = 1; }
        if (angleDamping === void 0) { angleDamping = 1; }
        if (gravityScale === void 0) { gravityScale = 0; }
        if (particleConeAngle === void 0) { particleConeAngle = PI; }
        if (fadeRate === void 0) { fadeRate = .1; }
        if (randomness === void 0) { randomness = .2; }
        if (randomColorLinear === void 0) { randomColorLinear = 1; }
        if (renderOrder === void 0) { renderOrder = additive ? 1e9 : 0; }
        var _this = 
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 6 arguments, but got 4.
        _super.call(this, pos, new Vector2, tileIndex, tileSize) || this;
        // emitter settings
        _this.emitSize = emitSize;
        _this.emitTime = emitTime;
        _this.emitRate = emitRate;
        _this.emitConeAngle = emitConeAngle;
        // color settings
        _this.colorStartA = colorStartA;
        _this.colorStartB = colorStartB;
        _this.colorEndA = colorEndA;
        _this.colorEndB = colorEndB;
        _this.randomColorLinear = randomColorLinear;
        // particle settings
        _this.particleTime = particleTime;
        _this.sizeStart = sizeStart;
        _this.sizeEnd = sizeEnd;
        _this.speed = speed;
        _this.angleSpeed = angleSpeed;
        _this.damping = damping;
        _this.angleDamping = angleDamping;
        _this.gravityScale = gravityScale;
        _this.particleConeAngle = particleConeAngle;
        _this.fadeRate = fadeRate;
        _this.randomness = randomness;
        _this.collideTiles = collideTiles;
        _this.additive = additive;
        _this.renderOrder = renderOrder;
        _this.trailScale =
            _this.emitTimeBuffer = 0;
        return _this;
    }
    /** Update the emitter to spawn particles, called automatically by engine once each frame */
    ParticleEmitter.prototype.update = function () {
        // only do default update to apply parent transforms
        this.parent && _super.prototype.update.call(this);
        // update emitter
        if (!this.emitTime || this.getAliveTime() <= this.emitTime) {
            // emit particles
            if (this.emitRate) {
                var rate = 1 / this.emitRate;
                for (this.emitTimeBuffer += timeDelta; this.emitTimeBuffer > 0; this.emitTimeBuffer -= rate)
                    this.emitParticle();
            }
        }
        else
            this.destroy();
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 5.
        debugParticles && debugRect(this.pos, vec2(this.emitSize), '#0f0', 0, this.angle);
    };
    /** Spawn one particle
     *  @return {Particle} */
    ParticleEmitter.prototype.emitParticle = function () {
        // spawn a particle
        var pos = this.emitSize.x != undefined ? // check if vec2 was used for size
            (new Vector2(rand(-.5, .5), rand(-.5, .5))).multiply(this.emitSize).rotate(this.angle) // box emitter
            : randInCircle(this.emitSize * .5); // circle emitter
        var particle = new Particle(this.pos.add(pos), this.tileIndex, this.tileSize, this.angle + rand(this.particleConeAngle, -this.particleConeAngle));
        // randomness scales each paremeter by a percentage
        var randomness = this.randomness;
        var randomizeScale = function (v) { return v + v * rand(randomness, -randomness); };
        // randomize particle settings
        var particleTime = randomizeScale(this.particleTime);
        var sizeStart = randomizeScale(this.sizeStart);
        var sizeEnd = randomizeScale(this.sizeEnd);
        var speed = randomizeScale(this.speed);
        var angleSpeed = randomizeScale(this.angleSpeed) * randSign();
        var coneAngle = rand(this.emitConeAngle, -this.emitConeAngle);
        var colorStart = randColor(this.colorStartA, this.colorStartB, this.randomColorLinear);
        var colorEnd = randColor(this.colorEndA, this.colorEndB, this.randomColorLinear);
        // build particle settings
        particle.colorStart = colorStart;
        particle.colorEndDelta = colorEnd.subtract(colorStart);
        particle.velocity = (new Vector2).setAngle(this.angle + coneAngle, speed);
        particle.angleVelocity = angleSpeed;
        particle.lifeTime = particleTime;
        particle.sizeStart = sizeStart;
        particle.sizeEndDelta = sizeEnd - sizeStart;
        particle.fadeRate = this.fadeRate;
        particle.damping = this.damping;
        particle.angleDamping = this.angleDamping;
        particle.elasticity = this.elasticity;
        particle.friction = this.friction;
        particle.gravityScale = this.gravityScale;
        particle.collideTiles = this.collideTiles;
        particle.additive = this.additive;
        particle.renderOrder = this.renderOrder;
        particle.trailScale = this.trailScale;
        particle.mirror = rand() < .5;
        // setup callbacks for particles
        particle.destroyCallback = this.particleDestroyCallback;
        this.particleCreateCallback && this.particleCreateCallback(particle);
        // return the newly created particle
        return particle;
    };
    // Particle emitters are not rendered, only the particles are
    ParticleEmitter.prototype.render = function () { };
    return ParticleEmitter;
}(EngineObject));
///////////////////////////////////////////////////////////////////////////////
/**
 * Particle Object - Created automatically by Particle Emitters
 */
// @ts-expect-error ts-migrate(2300) FIXME: Duplicate identifier 'Particle'.
var Particle = /** @class */ (function (_super) {
    __extends(Particle, _super);
    /**
     * Create a particle with the given settings
     * @param {Vector2} position                   - World space position of the particle
     * @param {Number}  [tileIndex=-1]              - Tile to use to render, untextured if -1
     * @param {Vector2} [tileSize=defaultTileSize] - Size of tile in source pixels
     * @param {Number}  [angle=0]                   - Angle to rotate the particle
     */
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 6 arguments, but got 5.
    function Particle(pos, tileIndex, tileSize, angle) {
        return _super.call(this, pos, new Vector2, tileIndex, tileSize, angle) || this;
    }
    /** Render the particle, automatically called each frame, sorted by renderOrder */
    Particle.prototype.render = function () {
        // modulate size and color
        var p = min((time - this.spawnTime) / this.lifeTime, 1);
        var radius = this.sizeStart + p * this.sizeEndDelta;
        var size = new Vector2(radius, radius);
        var fadeRate = this.fadeRate / 2;
        var color = new Color(this.colorStart.r + p * this.colorEndDelta.r, this.colorStart.g + p * this.colorEndDelta.g, this.colorStart.b + p * this.colorEndDelta.b, (this.colorStart.a + p * this.colorEndDelta.a) *
            (p < fadeRate ? p / fadeRate : p > 1 - fadeRate ? (1 - p) / fadeRate : 1)); // fade alpha
        // draw the particle
        this.additive && setBlendMode(1);
        if (this.trailScale) {
            // trail style particles
            var speed = this.velocity.length();
            var direction = this.velocity.scale(1 / speed);
            var trailLength = speed * this.trailScale;
            size.y = max(size.x, trailLength);
            this.angle = direction.angle();
            drawTile(this.pos.add(direction.multiply(vec2(0, -trailLength / 2))), size, this.tileIndex, this.tileSize, color, this.angle, this.mirror);
        }
        else
            drawTile(this.pos, size, this.tileIndex, this.tileSize, color, this.angle, this.mirror);
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 1 arguments, but got 0.
        this.additive && setBlendMode();
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 5.
        debugParticles && debugRect(this.pos, size, '#f005', 0, this.angle);
        if (p == 1) {
            // destroy particle when it's time runs out
            this.color = color;
            this.size = size;
            this.destroyCallback && this.destroyCallback(this);
            this.destroyed = 1;
        }
    };
    return Particle;
}(EngineObject));
var debug = 0;
var showWatermark = 0;
var godMode = 0;
var debugOverlay = 0;
var debugPhysics = 0;
var debugParticles = 0;
var debugRaycast = 0;
var debugGamepads = 0;
var debugMedals = 0;
// debug commands are automatically removed from the final build
var ASSERT = function () { };
var debugInit = function () { };
var debugUpdate = function () { };
var debugRender = function () { };
var debugRect = function () { };
var debugCircle = function () { };
var debugPoint = function () { };
var debugLine = function () { };
var debugAABB = function () { };
var debugClear = function () { };
var debugSaveCanvas = function () { };
///////////////////////////////////////////////////////////////////////////////
// Display settings
/** The max width of the canvas, centered if window is larger
 *  @default
 *  @memberof Settings */
var maxWidth = 1920;
/** The max height of the canvas, centered if window is larger
 *  @default
 *  @memberof Settings */
var maxHeight = 1200; // up to 1080p and 16:10
/** Fixed witdh, if enabled cavnvas size never changes
 *  @default
 *  @memberof Settings */
var fixedWidth = 0;
/** Fixed height, if enabled cavnvas size never changes
 *  @default
 *  @memberof Settings */
var fixedHeight = 0;
/** Fit to canvas to window by adding space on top or bottom if necessary
 *  @default
 *  @memberof Settings */
var fixedFitToWindow = 1;
/** Default font used for text rendering
 *  @default
 *  @memberof Settings */
var defaultFont = 'arial';
///////////////////////////////////////////////////////////////////////////////
// Tile sheet settings
/** Default size of tiles in pixels
 *  @type {Vector2}
 *  @default
 *  @memberof Settings */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
var defaultTileSize = vec2(16);
/** Prevent tile bleeding from neighbors in pixels
 *  @default
 *  @memberof Settings */
var tileBleedShrinkFix = .3;
/** Use crisp pixels for pixel art if true
 *  @default
 *  @memberof Settings */
var pixelated = 1;
///////////////////////////////////////////////////////////////////////////////
// Object settings
/** Default size of objects
 *  @type {Vector2}
 *  @default
 *  @memberof Settings */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
var defaultObjectSize = vec2(1);
/** Default object mass for collison calcuations (how heavy objects are)
 *  @default
 *  @memberof Settings */
var defaultObjectMass = 1;
/** How much to slow velocity by each frame (0-1)
 *  @default
 *  @memberof Settings */
var defaultObjectDamping = .99;
/** How much to slow angular velocity each frame (0-1)
 *  @default
 *  @memberof Settings */
var defaultObjectAngleDamping = .99;
/** How much to bounce when a collision occurs (0-1)
 *  @default
 *  @memberof Settings */
var defaultObjectElasticity = 0;
/** How much to slow when touching (0-1)
 *  @default
 *  @memberof Settings */
var defaultObjectFriction = .8;
/** Clamp max speed to avoid fast objects missing collisions
 *  @default
 *  @memberof Settings */
var maxObjectSpeed = 1;
/** How much gravity to apply to objects along the Y axis, negative is down
 *  @default
 *  @memberof Settings */
var gravity = 0;
///////////////////////////////////////////////////////////////////////////////
// Camera settings
/** Position of camera in world space
 *  @type {Vector2}
 *  @default
 *  @memberof Settings */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 0.
var cameraPos = vec2();
/** Scale of camera in world space
 *  @default
 *  @memberof Settings */
var cameraScale = max(defaultTileSize.x, defaultTileSize.y);
///////////////////////////////////////////////////////////////////////////////
// WebGL settings
/** Enable webgl rendering, webgl can be disabled and removed from build (with some features disabled)
 *  @default
 *  @memberof Settings */
var glEnable = 1;
/** Fixes slow rendering in some browsers by not compositing the WebGL canvas
 *  @default
 *  @memberof Settings */
var glOverlay = 1;
///////////////////////////////////////////////////////////////////////////////
// Input settings
/** Should gamepads be allowed
 *  @default
 *  @memberof Settings */
var gamepadsEnable = 1;
/** If true touch input is routed to mouse functions
 *  @default
 *  @memberof Settings */
var touchInputEnable = 1;
/** Allow players to use dpad as analog stick
 *  @default
 *  @memberof Settings */
var copyGamepadDirectionToStick = 1;
/** allow players to use WASD as direction keys
 *  @default
 *  @memberof Settings */
var copyWASDToDpad = 1;
///////////////////////////////////////////////////////////////////////////////
// Audio settings
/** All audio code can be disabled and removed from build
 *  @default
 *  @memberof Settings */
var soundEnable = 1;
/** Volume scale to apply to all sound, music and speech
 *  @default
 *  @memberof Settings */
var audioVolume = .5;
/** Default range where sound no longer plays
 *  @default
 *  @memberof Settings */
var defaultSoundRange = 30;
/** Default range percent to start tapering off sound (0-1)
 *  @default
 *  @memberof Settings */
var defaultSoundTaper = .7;
///////////////////////////////////////////////////////////////////////////////
// Medals settings
/** How long to show medals for in seconds
 *  @default
 *  @memberof Settings */
var medalDisplayTime = 5;
/** How quickly to slide on/off medals in seconds
 *  @default
 *  @memberof Settings */
var medalDisplaySlideTime = .5;
/** Width of medal display
 *  @default
 *  @memberof Settings */
var medalDisplayWidth = 640;
/** Height of medal display
 *  @default
 *  @memberof Settings */
var medalDisplayHeight = 99;
/** Size of icon in medal display
 *  @default
 *  @memberof Settings */
var medalDisplayIconSize = 80;
///////////////////////////////////////////////////////////////////////////////
// Tile Collision
// Internal variables not exposed to documentation
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'tileCollis... Remove this comment to see the full error message
var tileCollision = [], tileCollisionSize = vec2();
/** Clear and initialize tile collision
 *  @param {Vector2} size
 *  @memberof TileLayer */
function initTileCollision(size) {
    tileCollisionSize = size;
    tileCollision = [];
    for (var i = tileCollision.length = tileCollisionSize.area(); i--;)
        tileCollision[i] = 0;
}
/** Set tile collision data
 *  @param {Vector2} pos
 *  @param {Number}  [data=0]
 *  @memberof TileLayer */
var setTileCollisionData = function (pos, data) {
    if (data === void 0) { data = 0; }
    return pos.arrayCheck(tileCollisionSize) && (tileCollision[(pos.y | 0) * tileCollisionSize.x + pos.x | 0] = data);
};
/** Get tile collision data
 *  @param {Vector2} pos
 *  @return {Number}
 *  @memberof TileLayer */
var getTileCollisionData = function (pos) { return pos.arrayCheck(tileCollisionSize) ? tileCollision[(pos.y | 0) * tileCollisionSize.x + pos.x | 0] : 0; };
/** Check if collision with another object should occur
 *  @param {Vector2}      pos
 *  @param {Vector2}      [size=new Vector2(1,1)]
 *  @param {EngineObject} [object]
 *  @return {Boolean}
 *  @memberof TileLayer */
// @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 0.
function tileCollisionTest(pos, size, object) {
    if (size === void 0) { size = vec2(); }
    var minX = max(Math.floor(pos.x - size.x / 2), 0);
    var minY = max(Math.floor(pos.y - size.y / 2), 0);
    var maxX = min(pos.x + size.x / 2, tileCollisionSize.x - 1);
    var maxY = min(pos.y + size.y / 2, tileCollisionSize.y - 1);
    for (var y = minY; y < maxY; ++y)
        for (var x = minX; x < maxX; ++x) {
            var tileData = tileCollision[y * tileCollisionSize.x + x];
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
function tileCollisionRaycast(posStart, posEnd, object) {
    // test if a ray collides with tiles from start to end
    // todo: a way to get the exact hit point, it must still register as inside the hit tile
    posStart = posStart.floor();
    posEnd = posEnd.floor();
    var posDelta = posEnd.subtract(posStart);
    var dx = abs(posDelta.x), dy = -abs(posDelta.y);
    var sx = sign(posDelta.x), sy = sign(posDelta.y);
    var e = dx + dy;
    for (var x = posStart.x, y = posStart.y;;) {
        var tileData = getTileCollisionData(vec2(x, y));
        if (tileData && (object ? object.collideWithTileRaycast(tileData, new Vector2(x, y)) : tileData > 0)) {
            debugRaycast && debugLine(posStart, posEnd, '#f00', .02, 1);
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 0 arguments, but got 3.
            debugRaycast && debugPoint(new Vector2(x + .5, y + .5), '#ff0', 1);
            return new Vector2(x + .5, y + .5);
        }
        // update Bresenham line drawing algorithm
        // @ts-expect-error ts-migrate(2447) FIXME: The '&' operator is not allowed for boolean types.... Remove this comment to see the full error message
        if (x == posEnd.x & y == posEnd.y)
            break;
        var e2 = 2 * e;
        if (e2 >= dy)
            e += dy, x += sx;
        if (e2 <= dx)
            e += dx, y += sy;
    }
    debugRaycast && debugLine(posStart, posEnd, '#00f', .02, 1);
}
///////////////////////////////////////////////////////////////////////////////
// Tile Layer Rendering System
// Reuse canvas autmatically when destroyed
var tileLayerCanvasCache = [];
/** Tile layer data object stores info about how to render a tile */
var TileLayerData = /** @class */ (function () {
    /** Create a tile layer data object
     *  @param {Number}  [tile] - The tile to use, untextured if undefined
     *  @param {Number}  [direction=0] - Integer direction of tile, in 90 degree increments
     *  @param {Boolean} [mirror=0] - If the tile should be mirrored along the x axis
     *  @param {Color}   [color=new Color(1,1,1)] - Color of the tile
     */
    function TileLayerData(tile, direction, mirror, color) {
        if (direction === void 0) { direction = 0; }
        if (mirror === void 0) { mirror = 0; }
        if (color === void 0) { color = new Color; }
        this.tile = tile;
        this.direction = direction;
        this.mirror = mirror;
        this.color = color;
    }
    /** Set this tile to clear, it will not be rendered */
    // @ts-expect-error ts-migrate(2663) FIXME: Cannot find name 'color'. Did you mean the instanc... Remove this comment to see the full error message
    TileLayerData.prototype.clear = function () { this.tile = this.direction = this.mirror = 0; color = new Color; };
    return TileLayerData;
}());
/** Tile layer object - cached rendering system for tile layers */
var TileLayer = /** @class */ (function (_super) {
    __extends(TileLayer, _super);
    /** Create a tile layer data object
     *  @param {Vector2} [position=new Vector2(0,0)] - World space position
     *  @param {Vector2} [size=defaultObjectSize] - World space size
     *  @param {Vector2} [scale=new Vector2(1,1)] - How much to scale this in world space
     *  @param {Number}  [renderOrder=0] - Objects sorted by renderOrder before being rendered
     */
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
    function TileLayer(pos, size, scale, renderOrder) {
        if (scale === void 0) { scale = vec2(1); }
        if (renderOrder === void 0) { renderOrder = 0; }
        var _this = 
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 6 arguments, but got 2.
        _super.call(this, pos, size) || this;
        // create new canvas if necessary
        _this.canvas = tileLayerCanvasCache.length ? tileLayerCanvasCache.pop() : document.createElement('canvas');
        _this.context = _this.canvas.getContext('2d');
        _this.scale = scale;
        _this.tileSize = defaultTileSize.copy();
        _this.renderOrder = renderOrder;
        _this.flushGLBeforeRender = 1;
        // init tile data
        _this.data = [];
        for (var j = _this.size.area(); j--;)
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 1-4 arguments, but got 0.
            _this.data.push(new TileLayerData());
        return _this;
    }
    /** Destroy this tile layer */
    TileLayer.prototype.destroy = function () {
        // add canvas back to the cache
        tileLayerCanvasCache.push(this.canvas);
        _super.prototype.destroy.call(this);
    };
    /** Set data at a given position in the array
     *  @param {Vector2}       position - Local position in array
     *  @param {TileLayerData} data - Data to set
     *  @param {Boolean}       [redraw=0] - Force the tile to redraw if true */
    TileLayer.prototype.setData = function (layerPos, data, redraw) {
        if (layerPos.arrayCheck(this.size)) {
            this.data[(layerPos.y | 0) * this.size.x + layerPos.x | 0] = data;
            redraw && this.drawTileData(layerPos);
        }
    };
    /** Get data at a given position in the array
     *  @param {Vector2} layerPos - Local position in array
     *  @return {TileLayerData} */
    TileLayer.prototype.getData = function (layerPos) { return layerPos.arrayCheck(this.size) && this.data[(layerPos.y | 0) * this.size.x + layerPos.x | 0]; };
    // Tile layers are not updated
    TileLayer.prototype.update = function () { };
    // Render the tile layer, called automatically by the engine
    TileLayer.prototype.render = function () {
        ASSERT(mainContext != this.context); // must call redrawEnd() after drawing tiles
        // flush and copy gl canvas because tile canvas does not use gl
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
        this.flushGLBeforeRender && glEnable && glCopyToContext(mainContext);
        // draw the entire cached level onto the main canvas
        var pos = worldToScreen(this.pos.add(vec2(0, this.size.y * this.scale.y)));
        mainContext.drawImage(this.canvas, pos.x, pos.y, cameraScale * this.size.x * this.scale.x, cameraScale * this.size.y * this.scale.y);
    };
    /** Draw all the tile data to an offscreen canvas using webgl if possible */
    TileLayer.prototype.redraw = function () {
        this.redrawStart();
        this.drawAllTileData();
        this.redrawEnd();
    };
    /** Call to start the redraw process
     *  @param {Boolean} [clear=1] - Should it clear the canvas before drawing */
    TileLayer.prototype.redrawStart = function (clear) {
        if (clear === void 0) { clear = 1; }
        // clear and set size
        var width = this.size.x * this.tileSize.x;
        var height = this.size.y * this.tileSize.y;
        if (clear) {
            this.canvas.width = width;
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
    };
    /** Call to end the redraw process */
    TileLayer.prototype.redrawEnd = function () {
        var _a;
        ASSERT(mainContext == this.context); // must call redrawStart() before drawing tiles
        glCopyToContext(mainContext, 1);
        //debugSaveCanvas(this.canvas);
        // set stuff back to normal
        _a = this.savedRenderSettings, mainCanvasSize = _a[0], mainCanvas = _a[1], mainContext = _a[2], cameraScale = _a[3], cameraPos = _a[4];
    };
    /** Draw the tile at a given position
     *  @param {Vector2} layerPos */
    TileLayer.prototype.drawTileData = function (layerPos) {
        // first clear out where the tile was
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
        var pos = layerPos.floor().add(this.pos).add(vec2(.5));
        // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
        this.drawCanvas2D(pos, vec2(1), 0, 0, function (context) { return context.clearRect(-.5, -.5, 1, 1); });
        // draw the tile if not undefined
        var d = this.getData(layerPos);
        if (d.tile != undefined) {
            ASSERT(mainContext == this.context); // must call redrawStart() before drawing tiles
            // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
            drawTile(pos, vec2(1), d.tile, this.tileSize, d.color, d.direction * PI / 2, d.mirror);
        }
    };
    /** Draw all the tiles in this layer */
    TileLayer.prototype.drawAllTileData = function () {
        for (var x = this.size.x; x--;)
            for (var y = this.size.y; y--;)
                this.drawTileData(vec2(x, y));
    };
    /** Draw directly to the 2d canvas in world space (bipass webgl)
     *  @param {Vector2}  pos
     *  @param {Vector2}  size
     *  @param {Number}   angle
     *  @param {Boolean}  mirror
     *  @param {Function} drawFunction */
    TileLayer.prototype.drawCanvas2D = function (pos, size, angle, mirror, drawFunction) {
        var context = this.context;
        context.save();
        pos = pos.subtract(this.pos).multiply(this.tileSize);
        size = size.multiply(this.tileSize);
        context.translate(pos.x, this.canvas.height - pos.y);
        context.rotate(angle);
        context.scale(mirror ? -size.x : size.x, size.y);
        drawFunction(context);
        context.restore();
    };
    /** Draw a tile directly onto the layer canvas
     *  @param {Vector2} pos
     *  @param {Vector2} [size=new Vector2(1,1)]
     *  @param {Number}  [tileIndex=-1]
     *  @param {Vector2} [tileSize=defaultTileSize]
     *  @param {Color}   [color=new Color(1,1,1)]
     *  @param {Number}  [angle=0]
     *  @param {Boolean} [mirror=0] */
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 2 arguments, but got 1.
    TileLayer.prototype.drawTile = function (pos, size, tileIndex, tileSize, color, angle, mirror) {
        if (size === void 0) { size = vec2(1); }
        if (tileIndex === void 0) { tileIndex = -1; }
        if (tileSize === void 0) { tileSize = defaultTileSize; }
        if (color === void 0) { color = new Color; }
        if (angle === void 0) { angle = 0; }
        this.drawCanvas2D(pos, size, angle, mirror, function (context) {
            if (tileIndex < 0) {
                // untextured
                context.fillStyle = color.rgba();
                context.fillRect(-.5, -.5, 1, 1);
            }
            else {
                var cols = tileImage.width / tileSize.x;
                context.globalAlpha = color.a; // full color not supported in this mode
                context.drawImage(tileImage, (tileIndex % cols) * tileSize.x, (tileIndex / cols | 0) * tileSize.x, tileSize.x, tileSize.y, -.5, -.5, 1, 1);
            }
        });
    };
    /** Draw a rectangle directly onto the layer canvas
     *  @param {Vector2} pos
     *  @param {Vector2} [size=new Vector2(1,1)]
     *  @param {Color}   [color=new Color(1,1,1)]
     *  @param {Number}  [angle=0] */
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '0' is not assignable to paramete... Remove this comment to see the full error message
    TileLayer.prototype.drawRect = function (pos, size, color, angle) { this.drawTile(pos, size, -1, 0, color, angle, 0); };
    return TileLayer;
}(EngineObject));
/**
 *  LittleJS Utility Classes and Functions
 *  <br> - General purpose math library
 *  <br> - Vector2 - fast, simple, easy 2D vector class
 *  <br> - Color - holds a rgba color with some math functions
 *  <br> - Timer - tracks time automatically
 *  @namespace Utilities
 */
/** A shortcut to get Math.PI
 *  @const
 *  @memberof Utilities */
var PI = Math.PI;
/** True if running a Chromium based browser
 *  @const
 *  @memberof Utilities */
// @ts-expect-error ts-migrate(7015) FIXME: Element implicitly has an 'any' type because index... Remove this comment to see the full error message
var isChrome = window['chrome'];
/** Returns absoulte value of value passed in
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
var abs = function (a) { return a < 0 ? -a : a; };
/** Returns the sign of value passed in
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
var sign = function (a) { return a < 0 ? -1 : 1; };
/** Returns lowest of two values passed in
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
var min = function (a, b) { return a < b ? a : b; };
/** Returns highest of two values passed in
 *  @param {Number} valueA
 *  @param {Number} valueB
 *  @return {Number}
 *  @memberof Utilities */
var max = function (a, b) { return a > b ? a : b; };
/** Returns first parm modulo the second param, but adjusted so negative numbers work as expected
 *  @param {Number} dividend
 *  @param {Number} divisor
 *  @return {Number}
 *  @memberof Utilities */
var mod = function (a, b) { return ((a % b) + b) % b; };
/** Clamps the value beween max and min
 *  @param {Number} value
 *  @param {Number} [max=1]
 *  @param {Number} [min=0]
 *  @return {Number}
 *  @memberof Utilities */
var clamp = function (v, max, min) {
    if (max === void 0) { max = 1; }
    if (min === void 0) { min = 0; }
    return (ASSERT(max > min), v < min ? min : v > max ? max : v);
};
/** Returns what percentage the value is between max and min
 *  @param {Number} value
 *  @param {Number} [max=1]
 *  @param {Number} [min=0]
 *  @return {Number}
 *  @memberof Utilities */
var percent = function (v, max, min) {
    if (max === void 0) { max = 1; }
    if (min === void 0) { min = 0; }
    return max - min ? clamp((v - min) / (max - min)) : 0;
};
/** Linearly interpolates the percent value between max and min
 *  @param {Number} percent
 *  @param {Number} [max=1]
 *  @param {Number} [min=0]
 *  @return {Number}
 *  @memberof Utilities */
var lerp = function (p, max, min) {
    if (max === void 0) { max = 1; }
    if (min === void 0) { min = 0; }
    return min + clamp(p) * (max - min);
};
/** Formats seconds to 00:00 style for display purposes
 *  @param {Number} t - time in seconds
 *  @return {String}
 *  @memberof Utilities */
var formatTime = function (t) { return (t / 60 | 0) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60 | 0); };
/** Returns the nearest power of two not less then the value
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
// @ts-expect-error ts-migrate(2550) FIXME: Property 'log2' does not exist on type 'Math'. Do ... Remove this comment to see the full error message
var nearestPowerOfTwo = function (v) { return Math.pow(2, Math.ceil(Math.log2(v))); };
/** Applies smoothstep function to the percentage value
 *  @param {Number} value
 *  @return {Number}
 *  @memberof Utilities */
var smoothStep = function (p) { return p * p * (3 - 2 * p); };
/** Returns true if two axis aligned bounding boxes are overlapping
 *  @param {Vector2} pointA - Center of box A
 *  @param {Vector2} sizeA  - Size of box A
 *  @param {Vector2} pointB - Center of box B
 *  @param {Vector2} sizeB  - Size of box B
 *  @return {Boolean}       - True if overlapping
 *  @memberof Utilities */
// @ts-expect-error ts-migrate(2447) FIXME: The '&' operator is not allowed for boolean types.... Remove this comment to see the full error message
var isOverlapping = function (pA, sA, pB, sB) { return abs(pA.x - pB.x) * 2 < sA.x + sB.x & abs(pA.y - pB.y) * 2 < sA.y + sB.y; };
/** Returns an oscillating wave between 0 and amplitude with frequency of 1 Hz by default
 *  @param {Number} [frequency=1] - Frequency of the wave in Hz
 *  @param {Number} [amplitude=1] - Amplitude (max height) of the wave
 *  @param {Number} [t=time]      - Value to use for time of the wave
 *  @return {Number}              - Value waving between 0 and amplitude
 *  @memberof Utilities */
var wave = function (frequency, amplitude, t) {
    if (frequency === void 0) { frequency = 1; }
    if (amplitude === void 0) { amplitude = 1; }
    if (t === void 0) { t = time; }
    return amplitude / 2 * (1 - Math.cos(t * frequency * 2 * PI));
};
///////////////////////////////////////////////////////////////////////////////
/** Random global functions
 *  @namespace Random */
/** Returns a random value between the two values passed in
 *  @param {Number} [valueA=1]
 *  @param {Number} [valueB=0]
 *  @return {Number}
 *  @memberof Random */
var rand = function (a, b) {
    if (a === void 0) { a = 1; }
    if (b === void 0) { b = 0; }
    return b + (a - b) * Math.random();
};
/** Returns a floored random value the two values passed in
 *  @param {Number} [valueA=1]
 *  @param {Number} [valueB=0]
 *  @return {Number}
 *  @memberof Random */
var randInt = function (a, b) {
    if (a === void 0) { a = 1; }
    if (b === void 0) { b = 0; }
    return rand(a, b) | 0;
};
/** Randomly returns either -1 or 1
 *  @return {Number}
 *  @memberof Random */
var randSign = function () { return (rand(2) | 0) * 2 - 1; };
/** Returns a random Vector2 within a circular shape
 *  @param {Number} [radius=1]
 *  @param {Number} [minRadius=0]
 *  @return {Vector2}
 *  @memberof Random */
var randInCircle = function (radius, minRadius) {
    if (radius === void 0) { radius = 1; }
    if (minRadius === void 0) { minRadius = 0; }
    return radius > 0 ? randVector(radius * Math.pow(rand(minRadius / radius, 1), .5)) : new Vector2;
};
/** Returns a random Vector2 with the passed in length
 *  @param {Number} [length=1]
 *  @return {Vector2}
 *  @memberof Random */
var randVector = function (length) {
    if (length === void 0) { length = 1; }
    return new Vector2().setAngle(rand(2 * PI), length);
};
/** Returns a random color between the two passed in colors, combine components if linear
 *  @param {Color}   [colorA=new Color(1,1,1,1)]
 *  @param {Color}   [colorB=new Color(0,0,0,1)]
 *  @param {Boolean} [linear]
 *  @return {Color}
 *  @memberof Random */
var randColor = function (cA, cB, linear) {
    if (cA === void 0) { cA = new Color; }
    if (cB === void 0) { cB = new Color(0, 0, 0, 1); }
    return linear ? cA.lerp(cB, rand()) : new Color(rand(cA.r, cB.r), rand(cA.g, cB.g), rand(cA.b, cB.b), rand(cA.a, cB.a));
};
/** The seed used by the randSeeded function, should not be 0
 *  @memberof Random */
var randSeed = 1;
/** Returns a seeded random value between the two values passed in using randSeed
 *  @param {Number} [valueA=1]
 *  @param {Number} [valueB=0]
 *  @return {Number}
 *  @memberof Random */
var randSeeded = function (a, b) {
    if (a === void 0) { a = 1; }
    if (b === void 0) { b = 0; }
    randSeed ^= randSeed << 13;
    randSeed ^= randSeed >>> 17;
    randSeed ^= randSeed << 5; // xorshift
    return b + (a - b) * abs(randSeed % 1e9) / 1e9;
};
///////////////////////////////////////////////////////////////////////////////
/** Create a 2d vector, can take another Vector2 to copy, 2 scalars, or 1 scalar
 *  @param {Number} [x=0]
 *  @param {Number} [y=0]
 *  @return {Vector2}
 *  @memberof Utilities */
// @ts-expect-error ts-migrate(2339) FIXME: Property 'x' does not exist on type 'number'.
var vec2 = function (x, y) {
    if (x === void 0) { x = 0; }
    return x.x == undefined ? new Vector2(x, y == undefined ? x : y) : new Vector2(x.x, x.y);
};
/** 2D Vector object with vector math library */
var Vector2 = /** @class */ (function () {
    /** Create a 2D vector with the x and y passed in, can also be created with vec2()
     *  @param {Number} [x=0] - x axis position
     *  @param {Number} [y=0] - y axis position */
    function Vector2(x, y) {
        if (x === void 0) { x = 0; }
        if (y === void 0) { y = 0; }
        this.x = x;
        this.y = y;
    }
    /** Returns a new vector that is a copy of this
     *  @return {Vector2} */
    Vector2.prototype.copy = function () { return new Vector2(this.x, this.y); };
    /** Returns a copy of this vector plus the vector passed in
     *  @param {Vector2} vector
     *  @return {Vector2} */
    Vector2.prototype.add = function (v) { ASSERT(v.x != undefined); return new Vector2(this.x + v.x, this.y + v.y); };
    /** Returns a copy of this vector minus the vector passed in
     *  @param {Vector2} vector
     *  @return {Vector2} */
    Vector2.prototype.subtract = function (v) { ASSERT(v.x != undefined); return new Vector2(this.x - v.x, this.y - v.y); };
    /** Returns a copy of this vector times the vector passed in
     *  @param {Vector2} vector
     *  @return {Vector2} */
    Vector2.prototype.multiply = function (v) { ASSERT(v.x != undefined); return new Vector2(this.x * v.x, this.y * v.y); };
    /** Returns a copy of this vector divided by the vector passed in
     *  @param {Vector2} vector
     *  @return {Vector2} */
    Vector2.prototype.divide = function (v) { ASSERT(v.x != undefined); return new Vector2(this.x / v.x, this.y / v.y); };
    /** Returns a copy of this vector scaled by the vector passed in
     *  @param {Number} scale
     *  @return {Vector2} */
    Vector2.prototype.scale = function (s) { ASSERT(s.x == undefined); return new Vector2(this.x * s, this.y * s); };
    /** Returns the length of this vector
     * @return {Number} */
    Vector2.prototype.length = function () { return Math.pow(this.lengthSquared(), .5); };
    /** Returns the length of this vector squared
     * @return {Number} */
    Vector2.prototype.lengthSquared = function () { return Math.pow(this.x, 2) + Math.pow(this.y, 2); };
    /** Returns the distance from this vector to vector passed in
     * @param {Vector2} vector
     * @return {Number} */
    Vector2.prototype.distance = function (v) { return Math.pow(this.distanceSquared(v), .5); };
    /** Returns the distance squared from this vector to vector passed in
     * @param {Vector2} vector
     * @return {Number} */
    Vector2.prototype.distanceSquared = function (v) { return Math.pow((this.x - v.x), 2) + Math.pow((this.y - v.y), 2); };
    /** Returns a new vector in same direction as this one with the length passed in
     * @param {Number} [length=1]
     * @return {Vector2} */
    Vector2.prototype.normalize = function (length) {
        if (length === void 0) { length = 1; }
        var l = this.length();
        return l ? this.scale(length / l) : new Vector2(length);
    };
    /** Returns a new vector clamped to length passed in
     * @param {Number} [length=1]
     * @return {Vector2} */
    Vector2.prototype.clampLength = function (length) {
        if (length === void 0) { length = 1; }
        var l = this.length();
        return l > length ? this.scale(length / l) : this;
    };
    /** Returns the dot product of this and the vector passed in
     * @param {Vector2} vector
     * @return {Number} */
    Vector2.prototype.dot = function (v) { ASSERT(v.x != undefined); return this.x * v.x + this.y * v.y; };
    /** Returns the cross product of this and the vector passed in
     * @param {Vector2} vector
     * @return {Number} */
    Vector2.prototype.cross = function (v) { ASSERT(v.x != undefined); return this.x * v.y - this.y * v.x; };
    /** Returns the angle of this vector, up is angle 0
     * @return {Number} */
    Vector2.prototype.angle = function () { return Math.atan2(this.x, this.y); };
    /** Sets this vector with angle and length passed in
     * @param {Number} [angle=0]
     * @param {Number} [length=1] */
    Vector2.prototype.setAngle = function (a, length) {
        if (a === void 0) { a = 0; }
        if (length === void 0) { length = 1; }
        this.x = length * Math.sin(a);
        this.y = length * Math.cos(a);
        return this;
    };
    /** Returns copy of this vector rotated by the angle passed in
     * @param {Number} angle
     * @return {Vector2} */
    Vector2.prototype.rotate = function (a) { var c = Math.cos(a), s = Math.sin(a); return new Vector2(this.x * c - this.y * s, this.x * s + this.y * c); };
    /** Returns the integer direction of this vector, corrosponding to multiples of 90 degree rotation (0-3)
     * @return {Number} */
    Vector2.prototype.direction = function () { return abs(this.x) > abs(this.y) ? this.x < 0 ? 3 : 1 : this.y < 0 ? 2 : 0; };
    /** Returns a copy of this vector that has been inverted
     * @return {Vector2} */
    Vector2.prototype.invert = function () { return new Vector2(this.y, -this.x); };
    /** Returns a copy of this vector with the axies flipped
     * @return {Vector2} */
    Vector2.prototype.flip = function () { return new Vector2(this.y, this.x); };
    /** Returns a copy of this vector with each axis floored
     * @return {Vector2} */
    Vector2.prototype.floor = function () { return new Vector2(Math.floor(this.x), Math.floor(this.y)); };
    /** Returns the area this vector covers as a rectangle
     * @return {Number} */
    Vector2.prototype.area = function () { return this.x * this.y; };
    /** Returns a new vector that is p percent between this and the vector passed in
     * @param {Vector2} vector
     * @param {Number}  percent
     * @return {Vector2} */
    Vector2.prototype.lerp = function (v, p) { ASSERT(v.x != undefined); return this.add(v.subtract(this).scale(clamp(p))); };
    /** Returns true if this vector is within the bounds of an array size passed in
     * @param {Vector2} arraySize
     * @return {Boolean} */
    Vector2.prototype.arrayCheck = function (arraySize) { return this.x >= 0 && this.y >= 0 && this.x < arraySize.x && this.y < arraySize.y; };
    return Vector2;
}());
///////////////////////////////////////////////////////////////////////////////
/** Color object (red, green, blue, alpha) with some helpful functions */
var Color = /** @class */ (function () {
    /** Create a color with the components passed in, white by default
     *  @param {Number} [r=1] - red
     *  @param {Number} [g=1] - green
     *  @param {Number} [b=1] - blue
     *  @param {Number} [a=1] - alpha */
    function Color(r, g, b, a) {
        if (r === void 0) { r = 1; }
        if (g === void 0) { g = 1; }
        if (b === void 0) { b = 1; }
        if (a === void 0) { a = 1; }
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
    /** Returns a new color that is a copy of this
     * @return {Color} */
    Color.prototype.copy = function () { return new Color(this.r, this.g, this.b, this.a); };
    /** Returns a copy of this color plus the color passed in
     * @param {Color} color
     * @return {Color} */
    Color.prototype.add = function (c) { return new Color(this.r + c.r, this.g + c.g, this.b + c.b, this.a + c.a); };
    /** Returns a copy of this color minus the color passed in
     * @param {Color} color
     * @return {Color} */
    Color.prototype.subtract = function (c) { return new Color(this.r - c.r, this.g - c.g, this.b - c.b, this.a - c.a); };
    /** Returns a copy of this color times the color passed in
     * @param {Color} color
     * @return {Color} */
    Color.prototype.multiply = function (c) { return new Color(this.r * c.r, this.g * c.g, this.b * c.b, this.a * c.a); };
    /** Returns a copy of this color divided by the color passed in
     * @param {Color} color
     * @return {Color} */
    Color.prototype.divide = function (c) { return new Color(this.r / c.r, this.g / c.g, this.b / c.b, this.a / c.a); };
    /** Returns a copy of this color scaled by the value passed in, alpha can be scaled separately
     * @param {Number} scale
     * @param {Number} [alphaScale=scale]
     * @return {Color} */
    Color.prototype.scale = function (s, a) {
        if (a === void 0) { a = s; }
        return new Color(this.r * s, this.g * s, this.b * s, this.a * a);
    };
    /** Returns a copy of this color clamped to the valid range between 0 and 1
     * @return {Color} */
    Color.prototype.clamp = function () { return new Color(clamp(this.r), clamp(this.g), clamp(this.b), clamp(this.a)); };
    /** Returns a new color that is p percent between this and the color passed in
     * @param {Color}  color
     * @param {Number} percent
     * @return {Color} */
    Color.prototype.lerp = function (c, p) { return this.add(c.subtract(this).scale(clamp(p))); };
    /** Sets this color given a hue, saturation, lightness , and alpha
     * @param {Number} [hue=0]
     * @param {Number} [saturation=0]
     * @param {Number} [lightness=1]
     * @param {Number} [alpha=1]
     * @return {Color} */
    Color.prototype.setHSLA = function (h, s, l, a) {
        if (h === void 0) { h = 0; }
        if (s === void 0) { s = 0; }
        if (l === void 0) { l = 1; }
        if (a === void 0) { a = 1; }
        var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = function (p, q, t) {
            return (t = ((t % 1) + 1) % 1) < 1 / 6 ? p + (q - p) * 6 * t :
                t < 1 / 2 ? q :
                    t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
        };
        this.r = f(p, q, h + 1 / 3);
        this.g = f(p, q, h);
        this.b = f(p, q, h - 1 / 3);
        this.a = a;
        return this;
    };
    /** Returns a new color that has each component randomly adjusted
     * @param {Number} [amount=.05]
     * @param {Number} [alphaAmount=0]
     * @return {Color} */
    Color.prototype.mutate = function (amount, alphaAmount) {
        if (amount === void 0) { amount = .05; }
        if (alphaAmount === void 0) { alphaAmount = 0; }
        return new Color(this.r + rand(amount, -amount), this.g + rand(amount, -amount), this.b + rand(amount, -amount), this.a + rand(alphaAmount, -alphaAmount)).clamp();
    };
    /** Returns this color expressed as an rgba string
     * @return {String} */
    Color.prototype.rgba = function () {
        ASSERT(this.r >= 0 && this.r <= 1 && this.g >= 0 && this.g <= 1 && this.b >= 0 && this.b <= 1 && this.a >= 0 && this.a <= 1);
        return "rgb(" + (this.r * 255 | 0) + "," + (this.g * 255 | 0) + "," + (this.b * 255 | 0) + "," + this.a + ")";
    };
    /** Returns this color expressed as 32 bit integer value
     * @return {Number} */
    Color.prototype.rgbaInt = function () {
        ASSERT(this.r >= 0 && this.r <= 1 && this.g >= 0 && this.g <= 1 && this.b >= 0 && this.b <= 1 && this.a >= 0 && this.a <= 1);
        return (this.r * 255 | 0) + (this.g * 255 << 8) + (this.b * 255 << 16) + (this.a * 255 << 24);
    };
    return Color;
}());
///////////////////////////////////////////////////////////////////////////////
/** Timer object tracks how long has passed since it was set */
var Timer = /** @class */ (function () {
    /** Create a timer object set time passed in
     *  @param {Number} [timeLeft] - How much time left before the timer elapses in seconds */
    function Timer(timeLeft) {
        this.time = timeLeft == undefined ? undefined : time + timeLeft;
        this.setTime = timeLeft;
    }
    /** Set the timer with seconds passed in
     *  @param {Number} [timeLeft=0] - How much time left before the timer is elapsed in seconds */
    Timer.prototype.set = function (timeLeft) {
        if (timeLeft === void 0) { timeLeft = 0; }
        this.time = time + timeLeft;
        this.setTime = timeLeft;
    };
    /** Unset the timer */
    Timer.prototype.unset = function () { this.time = undefined; };
    /** Returns true if set
     * @return {Boolean} */
    Timer.prototype.isSet = function () { return this.time != undefined; };
    /** Returns true if set and has not elapsed
     * @return {Boolean} */
    Timer.prototype.active = function () { return time <= this.time; };
    /** Returns true if set and elapsed
     * @return {Boolean} */
    Timer.prototype.elapsed = function () { return time > this.time; };
    /** Get how long since elapsed, returns 0 if not set
     * @return {Number} */
    Timer.prototype.get = function () { return this.isSet() ? time - this.time : 0; };
    /** Get percentage elapsed based on time it was set to, returns 0 if not set
     * @return {Number} */
    Timer.prototype.getPercent = function () { return this.isSet() ? percent(this.time - time, 0, this.setTime) : 0; };
    return Timer;
}());
/**
 *  LittleJS WebGL Interface
 *  <br> - All webgl used by the engine is wrapped up here
 *  <br> - Can be disabled with glEnable to revert to 2D canvas rendering
 *  <br> - Batches sprite rendering on GPU for incredibly fast performance
 *  <br> - Sprite transform math is done in the shader where possible
 *  <br> - For normal stuff you won't need to call any functions in this file
 *  <br> - For advanced stuff there are helper functions to create shaders, textures, etc
 *  @namespace WebGL
 */
/** The WebGL canvas which appears above the main canvas and below the overlay canvas
 *  @type {HTMLCanvasElement}
 *  @memberof WebGL */
var glCanvas;
/** 2d context for glCanvas
 *  @type {WebGLRenderingContext}
 *  @memberof WebGL */
var glContext;
/** Main tile sheet texture automatically loaded by engine
 *  @type {WebGLTexture}
 *  @memberof WebGL */
var glTileTexture;
// WebGL internal variables not exposed to documentation
var glActiveTexture, glShader, glPositionData, glColorData, glBatchCount = 0, glDirty = 0, glAdditive = 0;
///////////////////////////////////////////////////////////////////////////////
// Init WebGL, called automatically by the engine
function glInit() {
    if (!glEnable)
        return;
    // create the canvas and tile texture
    glCanvas = document.createElement('canvas');
    glContext = glCanvas.getContext('webgl', { antialias: !pixelated });
    glTileTexture = glCreateTexture(tileImage);
    if (glOverlay) {
        // firefox is much faster without copying the gl buffer so we just overlay it with some tradeoffs
        document.body.appendChild(glCanvas);
        glCanvas.style = mainCanvas.style.cssText;
    }
    // setup vertex and fragment shaders
    glShader = glCreateProgram('precision lowp float;' + // use lowp for better performance
        'uniform mat4 m;' + // transform matrix
        'attribute float a;' + // angle
        'attribute vec2 p,s,t;' + // position, size, uv
        'attribute vec4 c,b;' + // color, additiveColor
        'varying vec2 v;' + // return uv
        'varying vec4 d,e;' + // return color, additiveColor
        'void main(){' + // shader entry point
        'gl_Position=m*vec4((s*cos(a)-vec2(-s.y,s)*sin(a))*.5+p,1,1);' + // transform position
        'v=t;d=c;e=b;' + // pass stuff to fragment shader
        '}' // end of shader
    , 'precision lowp float;' + // use lowp for better performance
        'varying vec2 v;' + // uv
        'varying vec4 d,e;' + // color, additiveColor
        'uniform sampler2D j;' + // texture
        'void main(){' + // shader entry point
        'gl_FragColor=texture2D(j,v)*d+e;' + // modulate texture by color plus additive
        '}' // end of shader
    );
    // init buffers
    var glVertexData = new ArrayBuffer(gl_MAX_BATCH * gl_VERTICES_PER_QUAD * gl_VERTEX_BYTE_STRIDE);
    glCreateBuffer(gl_ARRAY_BUFFER, glVertexData.byteLength, gl_DYNAMIC_DRAW);
    glPositionData = new Float32Array(glVertexData);
    glColorData = new Uint32Array(glVertexData);
    // setup the vertex data array
    var initVertexAttribArray = function (name, type, typeSize, size, normalize) {
        if (normalize === void 0) { normalize = 0; }
        var location = glContext.getAttribLocation(glShader, name);
        glContext.enableVertexAttribArray(location);
        glContext.vertexAttribPointer(location, size, type, normalize, gl_VERTEX_BYTE_STRIDE, offset);
        offset += size * typeSize;
    };
    var offset = glDirty = glBatchCount = 0;
    initVertexAttribArray('a', gl_FLOAT, 4, 1); // angle
    initVertexAttribArray('p', gl_FLOAT, 4, 2); // position
    initVertexAttribArray('s', gl_FLOAT, 4, 2); // size
    initVertexAttribArray('t', gl_FLOAT, 4, 2); // texture coords
    initVertexAttribArray('c', gl_UNSIGNED_BYTE, 1, 4, 1); // color
    initVertexAttribArray('b', gl_UNSIGNED_BYTE, 1, 4, 1); // additiveColor
}
/** Set the WebGl blend mode, normally you should call setBlendMode instead
 *  @param {Boolean} [additive=0]
 *  @memberof WebGL */
function glSetBlendMode(additive) {
    if (!glEnable)
        return;
    if (additive != glAdditive)
        glFlush();
    // setup blending
    glAdditive = additive;
    var destBlend = additive ? gl_ONE : gl_ONE_MINUS_SRC_ALPHA;
    glContext.blendFuncSeparate(gl_SRC_ALPHA, destBlend, gl_ONE, destBlend);
    glContext.enable(gl_BLEND);
}
/** Set the WebGl texture, not normally necessary unless multiple tile sheets are used
 *  <br> - This may also flush the gl buffer resulting in more draw calls and worse performance
 *  @param {WebGLTexture} [texture=glTileTexture]
 *  @memberof WebGL */
function glSetTexture(texture) {
    if (texture === void 0) { texture = glTileTexture; }
    if (!glEnable)
        return;
    if (texture != glActiveTexture)
        glFlush();
    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = texture);
}
/** Compile WebGL shader of the given type, will throw errors if in debug mode
 *  @param {String} source
 *  @param          type
 *  @return {WebGLShader}
 *  @memberof WebGL */
function glCompileShader(source, type) {
    if (!glEnable)
        return;
    // build the shader
    var shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);
    // check for errors
    if (debug && !glContext.getShaderParameter(shader, gl_COMPILE_STATUS))
        throw glContext.getShaderInfoLog(shader);
    return shader;
}
/** Create WebGL program with given shaders
 *  @param {WebGLShader} vsSource
 *  @param {WebGLShader} fsSource
 *  @return {WebGLProgram}
 *  @memberof WebGL */
function glCreateProgram(vsSource, fsSource) {
    if (!glEnable)
        return;
    // build the program
    var program = glContext.createProgram();
    glContext.attachShader(program, glCompileShader(vsSource, gl_VERTEX_SHADER));
    glContext.attachShader(program, glCompileShader(fsSource, gl_FRAGMENT_SHADER));
    glContext.linkProgram(program);
    // check for errors
    if (debug && !glContext.getProgramParameter(program, gl_LINK_STATUS))
        throw glContext.getProgramInfoLog(program);
    return program;
}
/** Create WebGL buffer
 *  @param bufferType
 *  @param size
 *  @param usage
 *  @return {WebGLBuffer}
 *  @memberof WebGL */
function glCreateBuffer(bufferType, size, usage) {
    if (!glEnable)
        return;
    // build the buffer
    var buffer = glContext.createBuffer();
    glContext.bindBuffer(bufferType, buffer);
    glContext.bufferData(bufferType, size, usage);
    return buffer;
}
/** Create WebGL texture from an image
 *  @param {Image} image
 *  @return {WebGLTexture}
 *  @memberof WebGL */
function glCreateTexture(image) {
    if (!glEnable)
        return;
    // build the texture
    var texture = glContext.createTexture();
    glContext.bindTexture(gl_TEXTURE_2D, texture);
    glContext.texImage2D(gl_TEXTURE_2D, 0, gl_RGBA, gl_RGBA, gl_UNSIGNED_BYTE, image);
    // use point filtering for pixelated rendering
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MIN_FILTER, pixelated ? gl_NEAREST : gl_LINEAR);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_MAG_FILTER, pixelated ? gl_NEAREST : gl_LINEAR);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_WRAP_S, gl_CLAMP_TO_EDGE);
    glContext.texParameteri(gl_TEXTURE_2D, gl_TEXTURE_WRAP_T, gl_CLAMP_TO_EDGE);
    return texture;
}
// called automatically by engine before render
function glPreRender(width, height) {
    if (!glEnable)
        return;
    // clear and set to same size as main canvas
    glCanvas.width = width;
    glCanvas.height = height;
    glContext.viewport(0, 0, width, height);
    // set up the shader
    glContext.bindTexture(gl_TEXTURE_2D, glActiveTexture = glTileTexture);
    glContext.useProgram(glShader);
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 1 arguments, but got 0.
    glSetBlendMode();
    // build the transform matrix
    var sx = 2 * cameraScale / width;
    var sy = 2 * cameraScale / height;
    glContext.uniformMatrix4fv(glContext.getUniformLocation(glShader, 'm'), 0, new Float32Array([
        sx, 0, 0, 0,
        0, sy, 0, 0,
        1, 1, -1, 1,
        -1 - sx * cameraPos.x, -1 - sy * cameraPos.y, 0, 0
    ]));
}
/** Draw all sprites and clear out the buffer, called automatically by the system whenever necessary
 *  @memberof WebGL */
function glFlush() {
    if (!glEnable || !glBatchCount)
        return;
    // draw all the sprites in the batch and reset the buffer
    glContext.bufferSubData(gl_ARRAY_BUFFER, 0, glPositionData.subarray(0, glBatchCount * gl_VERTICES_PER_QUAD * gl_INDICIES_PER_VERT));
    glContext.drawArrays(gl_TRIANGLES, 0, glBatchCount * gl_VERTICES_PER_QUAD);
    glBatchCount = 0;
}
/** Draw any sprites still in the buffer, copy to main canvas and clear
 *  @param {CanvasRenderingContext2D} context
 *  @param {Boolean} [forceDraw=0]
 *  @memberof WebGL */
function glCopyToContext(context, forceDraw) {
    if (!glEnable || !glDirty)
        return;
    glFlush();
    if (!glOverlay || forceDraw) {
        // do not draw/clear in overlay mode because the canvas is visible
        context.drawImage(glCanvas, 0, glAdditive = glDirty = 0);
        glContext.clear(gl_COLOR_BUFFER_BIT);
    }
}
// Draw a sprite with the given parameters, used internally by draw functions
function glDraw(x, y, sizeX, sizeY, angle, uv0X, uv0Y, uv1X, uv1Y, rgba, rgbaAdditive) {
    if (angle === void 0) { angle = 0; }
    if (uv0X === void 0) { uv0X = 0; }
    if (uv0Y === void 0) { uv0Y = 0; }
    if (uv1X === void 0) { uv1X = 1; }
    if (uv1Y === void 0) { uv1Y = 1; }
    if (rgba === void 0) { rgba = 0xffffffff; }
    if (rgbaAdditive === void 0) { rgbaAdditive = 0x00000000; }
    if (!glEnable)
        return;
    // flush if there is no room for more verts
    if (glBatchCount == gl_MAX_BATCH)
        glFlush();
    // setup 2 triangles to form a quad
    var offset = glBatchCount++ * gl_VERTICES_PER_QUAD * gl_INDICIES_PER_VERT;
    glDirty = 1;
    // vertex 0
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = -sizeX;
    glPositionData[offset++] = -sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    // vertex 1
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv0Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    // vertex 2
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = -sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv0Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    // vertex 0
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = -sizeX;
    glPositionData[offset++] = -sizeY;
    glPositionData[offset++] = uv0X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    // vertex 3
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = -sizeY;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv1Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
    // vertex 1
    glPositionData[offset++] = angle;
    glPositionData[offset++] = x;
    glPositionData[offset++] = y;
    glPositionData[offset++] = sizeX;
    glPositionData[offset++] = sizeY;
    glPositionData[offset++] = uv1X;
    glPositionData[offset++] = uv0Y;
    glColorData[offset++] = rgba;
    glColorData[offset++] = rgbaAdditive;
}
///////////////////////////////////////////////////////////////////////////////
// store gl constants as integers so their name doesn't use space in minifed
var gl_ONE = 1, gl_TRIANGLES = 4, gl_SRC_ALPHA = 770, gl_ONE_MINUS_SRC_ALPHA = 771, gl_BLEND = 3042, gl_TEXTURE_2D = 3553, gl_UNSIGNED_BYTE = 5121, gl_FLOAT = 5126, gl_RGBA = 6408, gl_NEAREST = 9728, gl_LINEAR = 9729, gl_TEXTURE_MAG_FILTER = 10240, gl_TEXTURE_MIN_FILTER = 10241, gl_TEXTURE_WRAP_S = 10242, gl_TEXTURE_WRAP_T = 10243, gl_COLOR_BUFFER_BIT = 16384, gl_CLAMP_TO_EDGE = 33071, gl_ARRAY_BUFFER = 34962, gl_DYNAMIC_DRAW = 35048, gl_FRAGMENT_SHADER = 35632, gl_VERTEX_SHADER = 35633, gl_COMPILE_STATUS = 35713, gl_LINK_STATUS = 35714, 
// constants for batch rendering
gl_VERTICES_PER_QUAD = 6, gl_INDICIES_PER_VERT = 9, gl_MAX_BATCH = 1 << 16, gl_VERTEX_BYTE_STRIDE = 4 + (4 * 2) * 3 + (4) * 2; // float + vec2 * 3 + (char * 4) * 2
