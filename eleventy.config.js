const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginRss = require("@11ty/eleventy-plugin-rss");

module.exports = function (conf) {
    conf.addPassthroughCopy('public/')
    conf.addPlugin(syntaxHighlight);
    conf.addPlugin(pluginRss);
    conf.addFilter("intro", (content) => {
        return content.split('</p>')[0] + '</p>'
    });
    return {
        dir: {
            output: "docs"
        }
    }
}
