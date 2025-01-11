// Init
const fs = require("fs");
const path = require("path");

global.__basedir = __dirname;

global.include = function (name) {
    return require(path.join(__basedir, name));
};

global.bl = function (name) {
    return global.include(path.join("bl", name));
};

const walk = function (dir) {
    let files = [];
    try {
        fs.readdirSync(dir).forEach((file) => {
            const current = path.join(dir, file);
            const stat = fs.lstatSync(current);
            if (stat.isDirectory()) {
                files.push(...walk(current));
            } else {
                files.push(current);
            }
        });
    } catch (error) {
        // ignore
    }
    return files;
};

const $magic = {};

$magic.scan = function (dir) {
    const result = [];
    const base = path.join(__basedir, dir);
    walk(base)
        .filter((file) => !file.endsWith(".js.map")) // Skip source maps
        .map((file) =>
            result.push({
                file,
                id: file.replace(base + "/", "").replace(".js", ""),
            })
        );

    return result;
};

module.exports = $magic;
