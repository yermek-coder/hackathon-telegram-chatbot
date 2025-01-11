require("dotenv").config();

const puppeteer = require("puppeteer");
const ffmpeg = require('fluent-ffmpeg');
const youtubedl = require('youtube-dl-exec');
const { readdir, rm } = require("fs/promises");
const fs = require("fs")

require("./magic");
const chatgpt = bl("chatgpt")

class Parser {
    browser;
    page;
    ua = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.3";
    youtubeCache = {}

    async init() {
        this.browser = await puppeteer.launch({
            headless: true, ignoreDefaultArgs: ["--mute-audio"], args: [
                "--window-size=1920,1080",
                "--window-position=1921,0",
                "--autoplay-policy=no-user-gesture-required",
            ]
        });

        this.page = await this.browser.newPage();
        // Bypass headless detection
        await this.page.setUserAgent(this.ua);
    }

    close() {
        this.browser.close()
        this.youtubeCache = {}
    }

    async worker(url) {
        await this.page.goto(url, { waitUntil: "networkidle2" });
        await this.delay(5000)

        const mainContent = await this.extractContent(this.page)
        const canvaContent = await this.handleCanvaIframe()
        const iframeContent = await this.handleIframe()

        console.log('iframeContent', iframeContent);

        const content = [mainContent, ...canvaContent, iframeContent].filter(Boolean)

        return content.join("\n")
    }

    async handleCanvaIframe() {
        const element = await this.page.$('iframe');
        const content = []

        if (element) {
            const iframe = await element.contentFrame();

            if (iframe && iframe.url().includes("canva")) {
                await this.handleCanvaSlider(element, content)
            }
        }

        return content
    }

    async handleCanvaSlider(element, content) {
        const iframe = await element.contentFrame();

        await this.delay(1000)
        content.push(await this.extractContent(iframe))

        const nextButtonSelector = "button[aria-label='Next page']"
        const nextButton = await iframe.$(nextButtonSelector)

        if (nextButton && await nextButton.evaluate(el => !el.hasAttribute("aria-disabled"))) {
            await iframe.click(nextButtonSelector)

            await this.page.waitForNetworkIdle();
            await this.delay(1000)

            await this.handleCanvaSlider(element, content)
        }
    }

    async handleIframe() {
        await this.delay(1000)

        const elements = await this.page.$$('iframe');
        const content = []

        for (const element of elements) {
            const iframe = await element.contentFrame();
            if (iframe) {
                content.push(await this.extractContent(iframe))
            }
        }

        return content.join("\n")
    }

    async extractContent(node, content = []) {
        content = [...content, await node.evaluate(() => document.body.innerText)]

        // Handle img tags that have to be called for video to appear
        const images = await node.$$('img');
        for (const image of images) {
            const src = await image.evaluate(img => img.src); // Get the src attribute

            if (src.includes('video')) {
                try {
                    await image.click();
                    console.log(`Clicked on image with src: ${src}`);
                } catch (error) {
                    console.error(`Failed to click on image with src: ${src}`);
                }
            }
        }

        // Transcribe video tags
        const videoTag = await node.$('video, video source')
        if (videoTag) {
            const videoUrl = await videoTag.evaluate(video => video.src)
            console.log('videoUrl', videoUrl);
            const path = await this.downloadAudio(videoUrl)
            path && content.push(await chatgpt.audioToText(path))
        }

        // Transcribe youtube videos
        const iframes = await node.$$("iframe");
        for (const frame of iframes) {
            const src = await frame.evaluate(el => el.src);

            if (src.includes('youtu')) {
                const tempPage = await this.browser.newPage()
                // Bypass headless detection
                await tempPage.setUserAgent(this.ua);
                await tempPage.goto(src, { waitUntil: "networkidle2" })

                const url = tempPage.url()
                const path = await this.downloadYoutubeAudio(url)
                if (path) {
                    const stats = fs.statSync(path);
                    const fileSizeInBytes = stats.size;
                    const sizeLimit = 25 * 1024 * 1024; // 25 MB in bytes
                    if (fileSizeInBytes < sizeLimit) {
                        const text = this.youtubeCache[url] || `Video title: ${await tempPage.title()}` + await chatgpt.audioToText(path)
                        content.push(text)
                        this.youtubeCache[url] = text
                    }
                }
                tempPage.close()
            }
        }

        return content.filter(Boolean).join("\n")
    }

    delay(time = 1) {
        return new Promise((resolve) => {
            setTimeout(resolve, time)
        })
    }

    retry(fn, retries = 3, delay = 1000) {
        return new Promise((resolve, reject) => {
            let attempts = 0;

            async function attempt() {
                attempts += 1;

                try {
                    const result = await fn();
                    resolve(result);
                } catch (error) {
                    if (attempts < retries) {
                        console.log(`Attempt ${attempts} failed. Retrying...`);
                        setTimeout(attempt, delay);
                    } else {
                        reject(`Failed after ${attempts} attempts: ${error.message}`);
                    }
                }
            }

            attempt();
        });
    }

    async downloadAudio(url) {
        return new Promise((resolve, reject) => {
            const path = `downloads/${new Date().getTime()}.mp3`
            ffmpeg(url)
                .toFormat('mp3')
                .save(path)
                .on('end', () => {
                    return resolve(path)
                })
                .on('err', (err) => {
                    return reject(err)
                })
        })
    }

    async downloadYoutubeAudio(url) {
        try {
            const path = `downloads/${new Date().getTime()}.mp3`
            await youtubedl(url, {
                extractAudio: true,
                audioFormat: 'mp3',
                output: path,
            });
            console.log('Audio downloaded successfully!');
            return path
        } catch (error) {
            console.error('Error downloading audio:', error);
        }
    }
}

async function deleteAllInDir(dirPath) {
    try {
        const items = await readdir(dirPath);
        const deleteFilePromises = items.map((name) =>
            rm(dirPath + "/" + name, {
                recursive: true,
                force: true,
            })
        );

        await Promise.all(deleteFilePromises);
    } catch (err) {
        console.log(err);
    }
}

async function train() {
    const parser = new Parser()
    await parser.init()

    const docList = [{
        description: "Рассказ о LATOKEN",
        path: 'https://coda.io/@latoken/latoken-talent/latoken-161'
    }, {
        description: "Информация о хакатоне",
        path: 'https://deliver.latoken.com/hackathon'
    }, {
        description: 'Культура компании',
        path: 'https://coda.io/@latoken/latoken-talent/culture-139'
    }]

    for (const doc of docList) {
        const content = await parser.worker(doc.url)

        const path = `documents/${doc.url.split("/").pop()}.txt`
        fs.writeFileSync(path, content);

        await deleteAllInDir("downloads")
    }

    parser.close()
}

train().then(() => {
    console.log("Training is done")
    process.exit(0);
})