const fs = require('fs-extra');
const Path = require('path');
const EOL = require('os').EOL;
const crypto = require('crypto');
const program = require('commander');

const ALGO = 'sha256';

var cwd = undefined;
program.version('1.1.0')
   .usage('[options] <directory>')
  .option('-o, --output <path>', 'Where to write the file, otherwise, just print to stdout')
  .action(function (dir) { cwd = dir; })
  .parse(process.argv);

if ( !cwd || Number.isNaN(program.review)) {
  program.help();
}

var hashMap = new Map();
var fileSize = new Map();

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
              fileSize.set(checksum, stats.size);
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

readDir(cwd, hashMap).then((fileCount) => {
  console.log("OK. Checked", fileCount, "items");

  // only look at dups
  let keys = Array.from(hashMap.keys());
  for (let checksum of keys) {
    let files = hashMap.get(checksum);
    if (files.length < 2) {
      hashMap.delete(checksum);
      fileSize.delete(checksum);
    }
  }

  let dup_space = 0;

  // convert HashMap to an object with a checksum and a list of paths
  let collisions = Array.from(hashMap.entries()).map((obj) => {
    let [checksum, paths] = obj;
    let size = fileSize.get(checksum);
    dup_space +=  size * (paths.length-1); // substract 1: we'll keep one copy
    return {checksum, size, paths};
  });

  return {
    "files_checked": fileCount,
    "number_of_collisions": hashMap.size,
    "bytes_occupied_by_dups": dup_space,
    "data": collisions
  };
}).then((results) => {
  let results_str = JSON.stringify(results, null, 4);
  if(program.output) {
    return fs.writeFile(program.output, results_str, 'utf8');
  } else {
    console.log(results_str);
  }
})

function calculateSha256(filePath) {
  return new Promise((resolve) => {
    let hash = crypto.createHash(ALGO),
        input = fs.createReadStream(filePath);

    input.on('end', () => resolve(hash.digest('hex')));
    input.on('data', (chunk) => hash.update(chunk));

  });
}
