const fs = require('fs-extra');
const Path = require('path');
const EOL = require('os').EOL;
const crypto = require('crypto');
const inquirer = require('inquirer');

const ALGO = 'sha256';

var hashMap = new Map();
var cwd = ".";
function readDir(cwd, hashMap) {
  return fs.readdir(cwd).then((files) => {
    let pAll = [ ];

    console.log('Checking directory', cwd);

    //forEach is synchronous
    files.forEach((file) => {

      let relPath = Path.join(cwd, file);
      let p = fs.stat(relPath).then((stats) => {

        if (stats.isFile()) {
          // calculate md5, add it to hashMap
          return calculateSha256(relPath).then((checksum) => {
            //console.log(relPath);
            if ( !hashMap.has(checksum)) {
              hashMap.set(checksum, [ relPath ]);
            } else {
              let list = hashMap.get(checksum);
              list.push(relPath);
            }
            return 1;
          });
        } else if (stats.isDirectory()) {
          // recurse
          return readDir(relPath, hashMap);
        } else {
          process.stderr.write("Neither file nor directory: " + relPath + EOL);
        }
      }); // fs.stat
      pAll.push(p);
    }); // file.forEach

    // now that we're iterated through the files
    // we've collected all of the promises
    return Promise.all(pAll).then((vals) => vals.reduce((s, v) => s + v, 0));
  }); // fs.readdir
}

var toDelete = [];
readDir('.', hashMap).then((howmany) => {
  console.log("OK. Checked", howmany, "items");
  let entries = Array.from(hashMap.entries()).map((obj) => obj[1]), // convert Iterator to Array
      itor = 0;

  // only look at dups
  entries = entries.filter((x) => x.length > 1);
  console.log("", entries.length, "collisions detected");

  let questions = entries.map((list) => {
    list.sort();
    return {
      type: "checkbox",
      name: "" + (itor++),
      message: "Select which duplicate files to delete.",
      choices: list,
      default: list.slice(0, -1) // select everything but the last item
    };
  });

  return inquirer.prompt(questions);
}).then((answers) => {
  for (let key in answers) {
    if (answers[key] !== undefined) {
      toDelete.push(answers[key]);
    }
  }
  //toDelete = Array.from(answers.entries()).map(o => o[1]).reduce((arr, curr) => {
  //toDelete = Array.from(answers.values()).reduce((arr, curr) => {
  toDelete = toDelete.reduce((arr, curr) => {

    arr.push(...curr);
    return arr;
  }, [ ]);

  console.log("", toDelete.length, "files to delete.");
  toDelete.forEach((x) => console.log("\t", x));
  return inquirer.prompt({
    type: "confirm",
    name: "delete",
    message: "Are you sure you want to delete " + toDelete.length + " files?",
    default: true
  });
}).then((confirm) => {
  if(confirm.delete) {
    return Promise.all(toDelete.map((file) => fs.remove(file)))
      .then(() => toDelete.length);
  } else {
    return 0;
  }
}).then((howmany) => {
  console.log("", howmany, "files deleted.");
});

function calculateSha256(filePath) {
  return new Promise((resolve) => {
    let hash = crypto.createHash(ALGO),
        input = fs.createReadStream(filePath);

    input.on('end', () => resolve(hash.digest('hex')));
    input.on('data', (chunk) => hash.update(chunk));

  });
}
