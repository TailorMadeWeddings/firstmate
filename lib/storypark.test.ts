import assert from "node:assert/strict";
import { test } from "node:test";
import { readExport } from "./storypark.ts";

// Shaped like a real stories_index.html (names and words made up).
const EXPORT = `<!DOCTYPE html><html><head><title>Ava Example</title><style>h1 {}</style></head><body>
<img class="thumb sp-c-avatar__img" src="Files/child-1-2.jpg"><h1>Ava Example</h1><br>
<div class="story">
<div class="content">
<h1>
Fold Painting &amp; Play
<small>Date: <time datetime="2026-10-13" data-local="time">October 13, 2026</time></small>
</h1>
<li class="js-text-block"><div class="text-container">
<p class="wysiwyg-text-align-center">The children folded&nbsp;paper. </p>
<p><span class="wysiwyg-font-size-large">Go Knights!</span></p>
</div></li>
<li><ul class="js-img-list"><li class="js-img-block"><img src="Files/1-fold-painting-1.jpg"></li></ul></li>
<li class="js-video-block"><video poster="Files/1-fold-painting-2.jpg"><source src="Files/1-fold-painting-2.mp4"></video></li>
<li class="js-pdf-block"><img src="Files/1-newsletter-3.jpg"><img src="Files/1-newsletter-4.jpg"></li>
<li class="comment" data-comment="9">
<div class="pull-left profile-image"><div class="sp-c-avatar"><img class="thumb sp-c-avatar__img" src="Files/user-5-6.jpg"></div></div>
<div class="content">
<div class="comment-author sp-u-margin-bottom--xxs">
Sam Parent (Ava)
<em class="small"><time datetime="2026-10-14T06:28:39+10:00">October 14, 2026 06:28</time></em>
</div>
<div class="comment-text" data-item="comment-text"><p>
Love it! 💙
</p></div>
<div class="images thumbnail-list"><div class="thumb-container landscape"><a><img data-key="x" src="Files/story-1-7.jpg"></a></div><div class="clearfix"></div></div>
</div>
<hr>
</li>
</div>
<div class="meta">
<h3>Story added by:</h3>
<p><img class="thumb sp-c-avatar__img" src="Files/user-8-9.jpg"><small>Kim Educator</small></p>
<div id="story-learning-tags"><h3>Learning tags:</h3><ul>
<li class="keywords"><span class="label blue tag tag-popover" data-content='
  &lt;div&gt;&lt;span class="breadcrumbs"&gt; 1. EYLF &lt;/span&gt;&lt;/div&gt;
'>EYLF Outcome 5.3 - Expressing ideas </span></li>
</ul></div>
</div>
</div>
<div class="story">
<div class="content"><h1>Untitled day<small><time datetime="2024-09-18">September 18, 2024</time></small></h1></div>
<div class="meta"><h3>Story added by:</h3><p><small>Kim Educator</small></p></div>
</div>
</body></html>`;

test("storypark: an export page", () => {
  const [one, two, ...rest] = readExport(EXPORT);
  assert.equal(rest.length, 0);
  assert.equal(one.title, "Fold Painting & Play");
  assert.equal(one.date, "2026-10-13");
  assert.equal(
    one.body,
    "The children folded paper.\n\nGo Knights!\n\nAdded by Kim Educator\n\nLearning tags: EYLF Outcome 5.3 - Expressing ideas\n\nComments\nSam Parent (Ava), 14 Oct 2026: Love it! 💙",
  );
  // The video's still frame and the PDF's pages; no avatars, and not the photo another family put in a comment.
  assert.deepEqual(one.images, ["Files/1-fold-painting-1.jpg", "Files/1-fold-painting-2.jpg", "Files/1-newsletter-3.jpg", "Files/1-newsletter-4.jpg"]);
  assert.equal(one.videos, 1);
  assert.deepEqual(two, { title: "Untitled day", date: "2024-09-18", body: "Added by Kim Educator", images: [], videos: 0 });
  assert.deepEqual(readExport("<body><h1>Ava Example</h1></body>"), []);
});
