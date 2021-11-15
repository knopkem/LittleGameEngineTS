import { ASSERT } from "./index";
import { debugMedals } from "./index";
import { overlayCanvas, overlayContext } from "./index";
import { defaultFont, medalDisplayHeight, medalDisplayWidth, medalDisplayIconSize, medalDisplayTime, medalDisplaySlideTime } from "./index";
import { timeReal } from "./index";
// import { enc, lib, AES } from 'crypto-js';

/** 
 *  LittleJS Medal System
 *  <br> - Tracks and displays medals
 *  <br> - Saves medals to local storage
 *  <br> - Newgrounds and OS13k integration
 *  @namespace Medals
 */


/** List of all medals
 *  @memberof Medals */
export const medals: any = [];

/** Set to stop medals from being unlockable (like if cheats are enabled)
 *  @memberof Medals */
 export let medalsPreventUnlock: boolean;

/** This can used to enable Newgrounds functionality
 *  @type {Newgrounds}
 *  @memberof Medals */
 export let newgrounds: any;

// Engine internal variables not exposed to documentation
let medalsDisplayQueue: any = [], medalsSaveName: string, medalsDisplayTimer: number;

///////////////////////////////////////////////////////////////////////////////

/** Initialize medals with a save name used for storage
 *  <br> - Checks if medals are unlocked
 *  <br> - Call this after creating all medals
 *  @param {String} saveName
 *  @memberof Medals */
 export function medalsInit(saveName: any)
{
    // check if medals are unlocked
    medalsSaveName = saveName;
    debugMedals || medals.forEach((medal: any) => medal.unlocked = localStorage[medal.storageKey()]);
}

/** Medal Object - Tracks an unlockable medal */
export class Medal
{
    description: any;
    icon: any;
    id: any;
    image: any;
    name: any;
    unlocked: any;
    /**
     * Create an medal object and adds it to the list of medals
     * @param {Number} id - The unique identifier of the medal
     * @param {String} name - Name of the medal
     * @param {String} [description] - Description of the medal
     * @param {String} [icon='🏆'] - Icon for the medal
     * @param {String} [src] - Image location for the medal
     */
    constructor(id: any, name: any, description='', icon='🏆', src: any)
    {

        ASSERT(id >= 0 && !medals[id]);

        // save attributes and add to list of medals
        medals[this.id = id] = this;
        this.name = name;
        this.description = description;
        this.icon = icon;

        if (src)
        {
            // load image
            this.image = new Image();
            this.image.src = src;
        }
    }

    /** Unlocks a medal if not already unlocked */
    unlock()
    {
        if (medalsPreventUnlock || this.unlocked)
            return;

        // save the medal

        ASSERT(medalsSaveName); // game name must be set
        localStorage[this.storageKey()] = this.unlocked = 1;
        medalsDisplayQueue.push(this);

        // save for newgrounds and OS13K
        newgrounds && newgrounds.unlockMedal(this.id);
        localStorage['OS13kTrophy,' + this.icon + ',' + medalsSaveName + ',' + this.name] = this.description;
    }

    /** Render a medal
     *  @param {Number} [hidePercent=0] - How much to slide the medal off screen
     */
    render(hidePercent=0)
    {
        const context = overlayContext;
        const x = overlayCanvas.width - medalDisplayWidth;
        const y = -medalDisplayHeight*hidePercent;

        // draw containing rect and clip to that region
        context.save();
        context.beginPath();
        context.fillStyle = '#ddd';
        context.rect(x, y, medalDisplayWidth, medalDisplayHeight);
        context.fill();
        context.strokeStyle = context.fillStyle = '#000';
        context.lineWidth = 2; 
        context.stroke();
        context.clip();

        this.renderIcon(x+15+medalDisplayIconSize/2, y+medalDisplayHeight/2);

        // draw the text
        context.textAlign = 'left';
        context.font = '3em '+ defaultFont;
        context.fillText(this.name, x+medalDisplayIconSize+25, y+35);
        context.font = '1.5em '+ defaultFont;
        context.fillText(this.description, x+medalDisplayIconSize+25, y+70);
        context.restore();
    }

    /** Render the icon for a medal
     *  @param {Number} x - Screen space X position
     *  @param {Number} y - Screen space Y position
     *  @param {Number} [size=medalDisplayIconSize] - Screen space size
     */
    renderIcon(x: any, y: any, size=medalDisplayIconSize)
    {
        // draw the image or icon
        const context = overlayContext;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = size*.6 + 'px '+ defaultFont;
        context.fillStyle = '#000';
        if (this.image)
            context.drawImage(this.image, x-size/2, y-size/2, size, size);
        else
            context.fillText(this.icon, x, y); // show icon if there is no image
    }

    // Get local storage key used by the medal
    storageKey()
    {
        return medalsSaveName + '_medal_' + this.id;
    }
}

// engine automatically renders medals
export function medalsRender()
{
    if (!medalsDisplayQueue.length)
        return;
    
    // update first medal in queue
    const medal = medalsDisplayQueue[0];
    const time = timeReal - medalsDisplayTimer;
    if (!medalsDisplayTimer)
        medalsDisplayTimer = timeReal;
    else if (time > medalDisplayTime)
        medalsDisplayQueue.shift(medalsDisplayTimer = 0);
    else
    {
        // slide on/off medals
        const slideOffTime = medalDisplayTime - medalDisplaySlideTime;
        const hidePercent = 
            time < medalDisplaySlideTime ? 1 - time / medalDisplaySlideTime :
            time > slideOffTime ? (time - slideOffTime) / medalDisplaySlideTime : 0;
        medal.render(hidePercent);
    }
}

///////////////////////////////////////////////////////////////////////////////

/** Newgrounds API wrapper object */
export class Newgrounds
{
    app_id: any;
    cipher: any;
    host: any;
    medals: any;
    scoreboards: any;
    session_id: any;
    /**
     * Create a newgrounds object
     * @param {Number} app_id - The newgrounds App ID
     * @param {String} [cipher] - The encryption Key (AES-128/Base64)
     */
    constructor(app_id: any, cipher: any)
    {

        ASSERT(!newgrounds && app_id);
        this.app_id = app_id;
        this.cipher = cipher;
        this.host = location ? location.hostname : '';

        // create an instance of CryptoJS for encrypted calls
        // cipher && (this.cryptoJS = CryptoJS);

        // get session id from url search params
        const url = new URL(window.location.href);
        this.session_id = url.searchParams.get('ngio_session_id') || 0;

        if (this.session_id == 0)
            return; // only use newgrounds when logged in

        // get medals
        const medalsResult = this.call('Medal.getList');
        this.medals = medalsResult ? medalsResult.result.data['medals'] : [];
        debugMedals && console.log(this.medals);
        for (const newgroundsMedal of this.medals)
        {
            const medal = medals[newgroundsMedal['id']];
            if (medal)
            {
                // copy newgrounds medal data
                medal.image =       new Image();
                medal.image.src =   newgroundsMedal['icon'];
                medal.name =        newgroundsMedal['name'];
                medal.description = newgroundsMedal['description'];
                medal.unlocked =    newgroundsMedal['unlocked'];
                medal.difficulty =  newgroundsMedal['difficulty'];
                medal.value =       newgroundsMedal['value'];

                if (medal.value)
                    medal.description = medal.description + ' (' + medal.value + ')';
            }
        }
    
        // get scoreboards
        const scoreboardResult = this.call('ScoreBoard.getBoards');
        this.scoreboards = scoreboardResult ? scoreboardResult.result.data.scoreboards : [];
        debugMedals && console.log(this.scoreboards);
    }

    /** Send message to unlock a medal by id
     * @param {Number} id - The medal id */

    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ id: any; }' is not assignable ... Remove this comment to see the full error message
    unlockMedal(id: any) { return this.call('Medal.unlock', {'id':id}, 1); }

    /** Send message to post score
     * @param {Number} id - The scoreboard id
     * @param {Number} value - The score value */

    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ id: any; value: any; }' is not... Remove this comment to see the full error message
    postScore(id: any, value: any) { return this.call('ScoreBoard.postScore', {'id':id, 'value':value}, 1); }

    /** Send message to log a view */

    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ host: any; }' is not assignabl... Remove this comment to see the full error message
    logView() { return this.call('App.logView', {'host':this.host}, 1); }

    /** Get scores from a scoreboard
     * @param {Number} id - The scoreboard id
     * @param {String} [user=0] - A user's id or name
     * @param {Number} [social=0] - If true, only social scores will be loaded
     * @param {Number} [skip=0] - Number of scores to skip before start
     * @param {Number} [limit=10] - Number of scores to include in the list
     * @return {Object} - The response JSON object
     */
    getScores(id: any, user=0, social=0, skip=0, limit=10)

    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ id: any; user: number; social:... Remove this comment to see the full error message
    { return this.call('ScoreBoard.getScores', {'id':id, 'user':user, 'social':social, 'skip':skip, 'limit':limit}); }

    /** Send a message to call a component of the Newgrounds API
     * @param {String}  component - Name of the component
     * @param {Object}  [parameters=0] - Parameters to use for call
     * @param {Boolean} [async=0] - If true, wait for response before continuing (will cause stall)
     * @return {Object} - The response JSON object
     */
    call(component: any, parameters=0, async=0)
    {
        const call = {'component':component, 'parameters':parameters};
        if (this.cipher)
        {
            // encrypt using AES-128 Base64 with cryptoJS
            /*
            const aesKey = enc.Base64.parse(this.cipher);
            const iv = lib.WordArray.random(16);
            const encrypted = AES.encrypt(JSON.stringify(call), aesKey, {'iv':iv});

            // @ts-expect-error ts-migrate(7053) FIXME: Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            call['secure'] = enc.Base64.stringify(iv.concat(encrypted['ciphertext']));
            call['parameters'] = 0;
            */
        }

        // build the input object
        const input = 
        {
            'app_id':     this.app_id,
            'session_id': this.session_id,
            'call':       call
        };

        // build post data
        const formData = new FormData();
        formData.append('input', JSON.stringify(input));
        
        // send post data
        const xmlHttp = new XMLHttpRequest();
        const url = 'https://newgrounds.io/gateway_v3.php';

        // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
        xmlHttp.open('POST', url, !debugMedals && async);
        xmlHttp.send(formData);
        debugMedals && console.log(xmlHttp.responseText);
        return xmlHttp.responseText && JSON.parse(xmlHttp.responseText);
    }
}

///////////////////////////////////////////////////////////////////////////////
