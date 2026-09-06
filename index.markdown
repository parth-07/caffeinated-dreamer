---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: home
---

<h1>
Linker
</h1>
{% for linker_blog in site.linker %}
  <h2>
    <a href="{{ linker_blog.url | relative_url }}">
      {{ linker_blog.title }}
    </a>
  </h2>
{% endfor %}
