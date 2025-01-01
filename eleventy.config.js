const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginRss = require("@11ty/eleventy-plugin-rss");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");

module.exports = function (conf) {
    conf.addPassthroughCopy('public/')
    conf.addPlugin(syntaxHighlight);
    conf.addPlugin(pluginRss);
    const md = markdownIt({
            html: true,
            linkify: true,
            typographer: true,
        })
            .disable("code")
            .use(markdownItAnchor, {
                permalink: markdownItAnchor.permalink.headerLink(),
                level: 2,
            });

    conf.setLibrary("md", md);
    conf.addFilter("intro", (content) => {
        const introP =  (content.split('</p>')[0]).split('<p class="wide">')[1];
        return `<p>${introP}</p>`
    });
    conf.addPassthroughCopy('posts/**/*.{jpg,png,mp4}');

    conf.addFilter("readableDate", (dateObj) => new Intl.DateTimeFormat('en-GB', {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(dateObj));
    conf.addFilter('htmlDateString', (dateObj) => new Intl.DateTimeFormat('en-GB').format(dateObj).split('/').reverse().join('-'));

    return {
        dir: {
            output: "docs"
        }
    }
}
