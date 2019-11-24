//
// scraper.js
//
// Copyright (c) 2016-2017 Junpei Kawamoto
//
// This software is released under the MIT License.
//
// http://opensource.org/licenses/mit-license.php
//
const cheerio = require("cheerio");
const phantom = require("./phantom-helper");
const BASE_URL = "https://www.youtube.com/watch?v=";
const HTTPS = "https://";
const HTTP = "http://";
const URL_PARAM = "watch?v=";
const URL_CHANNEL = "/channel/";
const SUCCESS = "success";

const _progress = require('cli-progress');

/*
Check like score and convert to integer if not.

## Args
* value: Like score to be checked.

## Returns
  Integer value.
 */
function check_like_score(value) {
    if (value != null) {
        const res = parseInt(value, 10);
        if (!isNaN(res)) {
            return res;
        }
    }
    return 0;
};

module.exports = {

    /*
    Scraping a given Youtube page and return a set of comments.

    ## Args
    * url: URL of the target page of video ID.

    ## Returns
      Promise object. Use "then" method to receive results.
     */
    comments(url) {

        let id
        if (!url.startsWith(HTTPS) && !url.startsWith(HTTP)) {
            id = url;
            url = BASE_URL + url;
        } else {
            const sp = url.split("/");
            id = sp[sp.length - 1].substring(URL_PARAM.length);
        }

        return new Promise((resolve, reject) => {

            return phantom.get().then((ph) => {

                return ph.createPage().then((page) => {
                    // console.log("Set PhantomJS page to print out any prints from inside an evaluate()");
                    page.property('onConsoleMessage', function(msg) {
                        console.warn(msg);
                    });
                    // console.warn("Create a new progress bar instance and use shades_classic theme");
                    var progress_bar = new _progress.Bar({}, _progress.Presets.shades_classic);
                    return page.open(url).then((status) => {

                        if (status != SUCCESS) {
                            return Promise.reject(`Open url returns ${status}`);
                        }
                        // console.log("The video page is opened");

                        return new Promise((resolve, reject) => {

                            // Check header information has been loaded.
                            // If not, wait 1000 msec and try again, until
                            // loading is finished.
                            function check_header() {
                                // PhantomJS doesn't arrow functions.
                                page.evaluate(function() {
                                    return document.getElementsByClassName("comment-section-header-renderer").length;
                                }).then((res) => {
                                    if (res != 0) {
                                        resolve();
                                    } else {
                                        setTimeout(check_header, 1000);
                                    }
                                }).catch(reject);
                            }
                            check_header();

                        });

                    }).then(() => {

                        // console.warn("Finding out the total number of comments...");

                        return new Promise((resolve, reject) => {
                            // Check header information has been loaded.
                            // If not, wait 1000 msec and try again
                            // until 5 times.
                            let times_tried_to_find_out_comments_amount = 0;
                            const max_amount_times_tried_to_find_out_comments_amount = 5;
                            const amount_wait_between_tries = 1000;
                            function find_comments_total_amount() {
                                page.evaluate(function() { // PhantomJS doesn't arrow functions.
                                    const selector__element_with_total_comments_value = "comment-section-header-renderer";
                                    const element_with_total_comments_value = document.getElementsByClassName(selector__element_with_total_comments_value);
                                    // console.log("Captured " + element_with_total_comments_value.length + " elements supposedly holding the comments count.");
                                    if (element_with_total_comments_value && element_with_total_comments_value.length === 1){
                                        // console.log("Exactly one element was found so it's probably the right one.")
                                        // console.log("Its HTML content:");
                                        // console.log(element_with_total_comments_value[0].innerHTML);
                                        const inside_text = element_with_total_comments_value[0].innerText;
                                        // console.log("Inner text: " + inside_text);
                                        var total_comments_amount_number;
                                        if(inside_text){
                                            // console.log("Extracing the number itself...");
                                            const text_number = inside_text.replace(',','').match(/\d+/);
                                            if(text_number === null){
                                                // console.log("Video has no comments");
                                                total_comments_amount_number = 0;
                                            }
                                            else {
                                                total_comments_amount_number = text_number[0];
                                            }
                                        }
                                        // console.log("Extracted total comments amount as: " + total_comments_amount_number);
                                        return total_comments_amount_number;
                                    }
                                    else if (element_with_total_comments_value && element_with_total_comments_value.length > 1){
                                        console.warn("More than one (" + element_with_total_comments_value.length + ") element matched selector: " + selector__element_with_total_comments_value);
                                        console.warn("Please amend the selector so that it finds only one element");
                                        console.warn("Skip scraping comments...")
                                        return -1;
                                    }
                                    else {
                                        console.warn("Couldn't find element with selector: " + selector__element_with_total_comments_value);
                                        console.warn("Skip scraping comments...")
                                        return -2;
                                    }
                                }).then((res) => {
                                    // console.log("Resolved amount of comments: " + res)
                                    if (res > 0) {
                                        // console.log('Displaying the progress bar. Radio silence until it is done, otherwise text prints on same line.');
                                        // start the progress bar with a total value of total comments and start value of 0
                                        progress_bar.start(res, 0);
                                        resolve();
                                    }
                                    else if(res === 0){
                                        resolve();
                                    }
                                    else if (res === -2){
                                        if(times_tried_to_find_out_comments_amount <= max_amount_times_tried_to_find_out_comments_amount){
                                            // console.log("Page probably not yet loaded. Waiting " + amount_wait_between_tries + "ms before trying again ["+times_tried_to_find_out_comments_amount+"/"+max_amount_times_tried_to_find_out_comments_amount+"]")
                                            times_tried_to_find_out_comments_amount++;
                                            setTimeout(find_comments_total_amount, amount_wait_between_tries);
                                        }
                                        else {
                                            console.warn("Waited enough for page to load but still couldn't find the element holding the comments. Please double-check the selector. ")
                                            console.warn("Skip scraping comments...")
                                            resolve();
                                        }
                                    }
                                    else {
                                        console.warn("Some problem occurred (see above) getting the number.")
                                        console.warn("Skip scraping comments...")
                                        resolve();
                                    }
                                }).catch((reason) => {
                                    console.error(reason);
                                    reject(reason);
                                });
                            }
                            find_comments_total_amount();
                        })
                    }).then(() => {
                        // console.log("Loading hidden pages and comments");

                        // PhantomJS doesn't support ES2015.
                        return page.evaluate(function() {
                            // console.warn("page.evaluate::function()");

                            // Load hidden pages. This function clickes a
                            // load-more-button and wait 2000msec,
                            // and then do these steps while there are
                            // load-more-buttons.
                            function load_hidden_pages() {
                                // console.warn("load_hidden_pages()::start");
                                var all_load_btns = document.getElementsByClassName("load-more-button");
                                var load_btns = [];
                                // ignore load more buttons with class yt-uix-load-more-error
                                // these guys have an inactive onClick (return false;)
                                // and will basically make this script infinitely loop
                                // console.warn("Load buttons found:" + all_load_btns.length);
                                var excluded_classes = [ 'yt-uix-load-more-error' ];
                                // console.warn("Filtering the good ones...");
                                for (var index = 0; index < all_load_btns.length; index++) {
                                    if(all_load_btns[index].classList.contains(excluded_classes[0]) === false){
                                        load_btns.push(all_load_btns[index]);
                                    }
                                }
                                // console.warn("Good buttons found:" + load_btns.length);
                                if (load_btns.length !== 0) {
                                    // console.warn("Clicking first one: " + load_btns[0].getAttribute("aria-label"));
                                    load_btns[0].click();
                                    // console.warn("Wait before clicking again");
                                    setTimeout(load_hidden_pages, 500);
                                } else {
                                    // console.warn("Did not find 'Load More' buttons");
                                }
                                // console.warn("load_hidden_pages()::end");
                            };
                            // console.warn("calling load_hidden_pages()");
                            load_hidden_pages();
                            // console.warn("after calling load_hidden_pages");
                        });
                    }).then(() => {

                        // console.log("then() after loading hidden pages & comments");

                        return new Promise((resolve, reject) => {

                            /**
                             * Increments the progress bar with the amount of comments elements currently scrapped (i.e. loaded in DOM so far)
                             */
                            function update_progress_bar(){
                                return new Promise((resolve, reject) => {
                                    page.evaluate(function() {
                                        return document.getElementsByClassName("comment-renderer-text-content").length;
                                    }).then((res) => {
                                        progress_bar.update(res);
                                        resolve();
                                    }).catch((reason) => {
                                        console.error(reason);
                                        reject(reason);
                                    });
                                });
                            }

                            function get_body() {
                                // PhantomJS doesn't support arrow functions.
                                page.evaluate(function() {
                                    var all_load_btns = document.getElementsByClassName("load-more-button");
                                    var load_btns = [];
                                    // ignore load more buttons with class yt-uix-load-more-error
                                    // these guys have an inactive onClick (return false;)
                                    // and will basically make this script infinitely loop
                                    // console.warn("Load buttons found:" + all_load_btns.length);
                                    var excluded_classes = [ 'yt-uix-load-more-error' ];
                                    // console.warn("Filtering the good ones...");
                                    for (var index = 0; index < all_load_btns.length; index++) {
                                        if(all_load_btns[index].classList.contains(excluded_classes[0]) === false){
                                            load_btns.push(all_load_btns[index]);
                                        }
                                    }
                                    // console.warn("Good buttons found:" + load_btns.length);
                                    if (load_btns.length === 0) {
                                        // console.warn('No "Load comments" buttons found');
                                        // console.warn('Return the loaded content');
                                        return document.body.innerHTML;
                                    } else {
                                        // console.warn("We're still seeing \"Load More\" which means we're not done loading yet.");
                                    }
                                }).then((html) => {
                                    // console.warn("then(html)");
                                    if (html) {
                                        // console.warn("All comments loaded!");
                                        update_progress_bar()
                                        .then((val) => {
                                            progress_bar.stop();
                                            resolve(html);
                                        });
                                    } else {
                                        // console.warn("Not all comments loaded yet, check again later");
                                        update_progress_bar();
                                        setTimeout(get_body, 2000);
                                    }
                                }).catch(reject);
                            }
                            get_body();
                        });

                    }).then((html) => {
                        page.close();
                        // TODO: fix it.

                        // console.warn("Contents are loaded");
                        const $ = cheerio.load(html);
                        const res = [];

                        $(".comment-thread-renderer").each((_, elem) => {
                            const root = $(elem).children().first();
                            const children = [];
                            $(".comment-replies-renderer .comment-replies-renderer-pages .comment-renderer", this).each((_, elem) => {
                                const author = $(".comment-renderer-header", elem).children().first();
                                const child = {
                                    comment: $(".comment-renderer-text-content", elem).text(),
                                    author: author.text(),
                                    author_id: author.data("ytid"),
                                    like: check_like_score($(".comment-renderer-like-count.off", elem).text())
                                };
                                const receiver = $(".comment-renderer-text-content", elem).find("a").text();
                                if (receiver !== "") {
                                    child.receiver = receiver;
                                }
                                children.push(child);
                            });
                            const author = $(".comment-author-text", root);
                            const comment = {
                                root: $(".comment-renderer-text-content", root).text(),
                                author: author.text(),
                                author_id: author.data("ytid"),
                                like: check_like_score($(".comment-renderer-like-count.off", root).text())
                            };
                            if (children.length !== 0) {
                                comment.children = children;
                            }
                            res.push(comment);
                        });

                        const user = $(".yt-user-info a");
                        resolve({
                            id: id,
                            channel: {
                                id: user.attr("href").substring(URL_CHANNEL.length),
                                name: user.text()
                            },
                            comments: res
                        });

                    }).catch((reason) => {
                        console.error(reason);
                        page.close();
                        reject(reason);
                    });

                });
            });
        });
    },

    /*
    Scraping a Youtube channel page and return a description of the channel.

    ## Args
    * id: channel ID.

    ## Returns
      Promise object. Use "then" method to receive results.
     */
    channel(id) {
        let url;
        if (id.startsWith(HTTP) || id.startsWith(HTTPS)) {
            if (!id.endsWith("/about")) {
                url = id + "/about";
            } else {
                url = id;
            }
        } else {
            url = "https://www.youtube.com/channel/" + id + "/about";
        }

        return new Promise((resolve, reject) => {

            return phantom.get().then((ph) => {

                return ph.createPage().then((page) => {

                    return page.open(url).then((status) => {
                        if (status != SUCCESS) {
                            return Promise.reject(`Open url returns ${status}.`)
                        }
                        // PhantomJS doesn't support ES2015.
                        return page.evaluate(function() {
                            return document.body.innerHTML;
                        });
                    }).then((html) => {
                        page.close();
                        const $ = cheerio.load(html);
                        resolve({
                            id: id,
                            name: $(".qualified-channel-title-text").text(),
                            description: $(".about-description").text().replace(/^\s+|\s+$/g, "")
                        });
                    }).catch((err) => {
                        console.error(err);
                        page.close();
                        reject(reason);
                    });

                });
            });
        });
    },

    /*
    Close this module.

    This function should be called to close PhantomJS processes.
     */
    close: phantom.close

}; 
