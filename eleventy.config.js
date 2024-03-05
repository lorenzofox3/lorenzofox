const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginRss = require("@11ty/eleventy-plugin-rss");

module.exports = function (conf) {
    conf.addPassthroughCopy('public/')
    conf.addPlugin(syntaxHighlight);
    conf.addPlugin(pluginRss);
    conf.addFilter("intro", (content) => {
        return content.split('</p>')[0] + '</p>'
    });
    conf.addPassthroughCopy({
        "./node_modules/prismjs/themes/prism-okaidia.css": "/public/prism-okaidia.css"
    });

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
