(function () {
  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var tocRoot = document.querySelector("[data-toc]");
    if (!tocRoot) {
      return;
    }

    var article = document.querySelector('article[itemprop="articleBody"]');
    if (!article) {
      article = document.querySelector("article");
    }
    if (!article) {
      return;
    }

    var headings = article.querySelectorAll("h1, h2, h3");
    if (!headings.length) {
      if (tocRoot.parentElement) {
        tocRoot.parentElement.style.display = "none";
      }
      return;
    }

    var used = {};
    headings.forEach(function (heading) {
      var text = heading.textContent.trim();
      if (!text) {
        return;
      }

      var id = heading.id;
      if (!id) {
        id = slugify(text);
        var base = id || "section";
        var index = 2;
        while (document.getElementById(id) || used[id]) {
          id = base + "-" + index;
          index += 1;
        }
        heading.id = id;
      }

      used[id] = true;

      var item = document.createElement("li");
      item.className = "toc__item toc__item--" + heading.tagName.toLowerCase();

      var link = document.createElement("a");
      link.className = "toc__link";
      link.href = "#" + id;
      link.textContent = text;

      item.appendChild(link);
      tocRoot.appendChild(item);
    });

    if (!tocRoot.children.length && tocRoot.parentElement) {
      tocRoot.parentElement.style.display = "none";
    }
  });
})();
