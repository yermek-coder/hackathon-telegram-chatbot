require("dotenv").config();

const $m = require("./magic");

// Requires
const http = require("http");
const _ = require("underscore");
const express = require("express");
const bodyParser = require("body-parser");

const config = bl("config");

const app = express();
const server = http.createServer(app);

// Inject Businesslogic
_.each($m.scan("bl"), function (bl) {
    console.log(`Using Businesslogic: ${bl.id}`);
    require(bl.file);
})

app.set("port", config.port);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Inject Web Routes
_.each($m.scan("routes"), function (route) {
    const router = require(route.file);
    if (router) {
        console.log(`Using Route: ${route.id}`);
        app.use("/", router);
    }
});

// Error Handling (404 if no other route matches)
app.use(function (req, res, next) {
    const err = new Error("Not Found");
    err.status = 404;
    err.ref = `${req.method?.toUpperCase()} ${req.url}`;
    next(err);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
server.listen(app.get("port"), function () {
    console.log(`Express server listening on port ${server.address().port}`);
});

module.exports = {
    app: app,
    server: server
};
