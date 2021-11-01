const { execSync } = require("child_process");

const files = [
'./engine/engineUtilities.js',
'./engine/engineSettings.js',
'./engine/engine.js',
'./engine/engineObject.js',
'./engine/engineDraw.js',
'./engine/engineInput.js',
'./engine/engineAudio.js',
'./engine/engineTileLayer.js',
'./engine/engineParticles.js',
'./engine/engineRelease.js',
'./engine/engineMedals.js',
'./engine/engineWebGL.js'
];

const filestring = files.map((item) => `--js ${item}`).join(' ');

execSync(`google-closure-compiler ${filestring} --js_output_file temp.js --language_out ECMASCRIPT_2019 --warning_level VERBOSE --jscomp_off *`);
console.log('done building');

execSync(`uglifyjs -o ./engine/engine.all.min.js temp.js`);
console.log('done minimizing');
