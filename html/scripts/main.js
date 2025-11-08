const createElement = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (typeof text === 'string') el.textContent = text;
  return el;
};

const escapeHtml = (str = '') =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const applyInlineMarkdown = (text = '') => {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return html;
};

const renderMarkdown = (md = '') => {
  if (!md.trim()) {
    return '<div class="markdown-empty">（暂无内容）</div>';
  }

  const lines = md.split(/\r?\n/);
  let html = '';
  let paragraph = [];
  let inUl = false;
  let inOl = false;
  let inFence = false;
  let fenceBuffer = [];

  const closeLists = () => {
    if (inUl) {
      html += '</ul>';
      inUl = false;
    }
    if (inOl) {
      html += '</ol>';
      inOl = false;
    }
  };

  const closeFence = () => {
    if (!inFence) return;
    html += `<pre><code>${escapeHtml(fenceBuffer.join('\n'))}</code></pre>`;
    fenceBuffer = [];
    inFence = false;
  };

  const flushParagraph = () => {
    if (paragraph.length) {
      html += `<p>${applyInlineMarkdown(paragraph.join(' '))}</p>`;
      paragraph = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      if (!inFence) {
        flushParagraph();
        closeLists();
        inFence = true;
      } else {
        closeFence();
      }
      return;
    }

    if (inFence) {
      fenceBuffer.push(line);
      return;
    }

    const ulMatch = /^\s*[-*]\s+/.test(line);
    const olMatch = /^\s*\d+\.\s+/.test(line);

    if (!trimmed.length) {
      flushParagraph();
      closeLists();
      return;
    }

    if (ulMatch) {
      flushParagraph();
      if (!inUl) {
        closeLists();
        html += '<ul>';
        inUl = true;
      }
      html += `<li>${applyInlineMarkdown(line.replace(/^\s*[-*]\s+/, ''))}</li>`;
      return;
    }

    if (olMatch) {
      flushParagraph();
      if (!inOl) {
        closeLists();
        html += '<ol>';
        inOl = true;
      }
      html += `<li>${applyInlineMarkdown(line.replace(/^\s*\d+\.\s+/, ''))}</li>`;
      return;
    }

    paragraph.push(trimmed);
  });

  flushParagraph();
  closeLists();
  closeFence();

  return html;
};

const renderHero = (data, meta, pageTitle) => {
  const section = createElement('section', 'card hero');
  if (pageTitle) {
    document.title = pageTitle;
  }

  if (meta?.sectionLabel) {
    section.appendChild(createElement('div', 'section-title', meta.sectionLabel));
  }

  const title = createElement('h1');
  title.textContent = data.title || pageTitle || '';
  section.appendChild(title);

  if (data.description) {
    const desc = createElement('p');
    desc.textContent = data.description;
    section.appendChild(desc);
  }

  if (Array.isArray(data.chips) && data.chips.length) {
    const chips = createElement('div', 'chips');
    data.chips.forEach((chip) => {
      const span = document.createElement('span');
      span.textContent = chip;
      chips.appendChild(span);
    });
    section.appendChild(chips);
  }


  return section;
};

const renderTextSection = (section) => {
  const card = createElement('section', 'card text-block');
  if (section.type === 'text_titled' && section.heading) {
    card.appendChild(createElement('div', 'section-title', section.heading));
  }
  const body = createElement('div', 'markdown');
  body.innerHTML = renderMarkdown(section.content || '');
  card.appendChild(body);
  return card;
};

const renderCard = (card) => {
  const article = createElement('article', 'info-card');
  if (card.title) {
    article.appendChild(createElement('h3', null, card.title));
  }
  if (card.status) {
    const statusText = card.status.toUpperCase();
    const statusClass =
      statusText === 'ONLINE'
        ? 'status online'
        : statusText === 'UPDATED'
        ? 'status updated'
        : 'status';
    article.appendChild(createElement('span', statusClass, statusText));
  }

  if (card.content) {
    const body = createElement('div', 'markdown');
    body.innerHTML = renderMarkdown(card.content);
    article.appendChild(body);
  }

  if (Array.isArray(card.meta) && card.meta.length) {
    const metaWrap = createElement('div', 'mini-meta');
    card.meta.forEach((item) => {
      const span = document.createElement('span');
      span.textContent = item;
      metaWrap.appendChild(span);
    });
    article.appendChild(metaWrap);
  }

  if (card.linkLabel && card.linkUrl) {
    const link = document.createElement('a');
    link.href = card.linkUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = card.linkLabel;
    article.appendChild(link);
  }

  return article;
};

const renderCardSection = (section) => {
  const layout = section.type === 'cards_vertical' ? 'vertical' : 'horizontal';
  const container = createElement('section', `card section-cards ${layout}`);
  if (section.heading) {
    container.appendChild(createElement('div', 'section-title', section.heading));
  }
  const grid = createElement('div', `cards-grid ${layout}`);
  (section.cards || []).forEach((card) => {
    grid.appendChild(renderCard(card));
  });
  container.appendChild(grid);
  return container;
};

const renderSection = (section) => {
  if (!section || !section.type) return null;
  if (section.type.startsWith('text')) {
    return renderTextSection(section);
  }
  if (section.type.startsWith('cards')) {
    return renderCardSection(section);
  }
  return null;
};

const determineSlug = () => {
  const pathMatch = window.location.pathname.match(/^\/p\/([^/]+)/);
  if (pathMatch) {
    return decodeURIComponent(pathMatch[1]);
  }
  const search = new URLSearchParams(window.location.search);
  return search.get('page') || 'home';
};

const renderError = (message, suggestion) => {
  const app = document.getElementById('app');
  app.innerHTML = '';
  const card = createElement('section', 'card text-block');
  card.appendChild(createElement('h2', null, '无法加载页面'));
  card.appendChild(createElement('p', null, message));
  if (suggestion) {
    const hint = createElement('p');
    hint.innerHTML = suggestion;
    card.appendChild(hint);
  }
  app.appendChild(card);
};

const loadPage = async () => {
  const slug = determineSlug();
  const response = await fetch(`/api/pages/${encodeURIComponent(slug)}.json`, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    renderError(
      `未找到名为 “${slug}” 的页面。`,
      `返回 <a href="/p/home">/p/home</a> 或联系管理员。`
    );
    return;
  }

  const data = await response.json();
  const app = document.getElementById('app');
  app.innerHTML = '';
  if (data.hero) {
    app.appendChild(renderHero(data.hero, data.meta || {}, data.pageTitle));
  }
  (data.sections || []).forEach((section) => {
    const el = renderSection(section);
    if (el) app.appendChild(el);
  });
  if (data.footer) {
    const footerEl = document.createElement('footer');
    footerEl.textContent = data.footer;
    app.appendChild(footerEl);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadPage().catch((err) => {
    console.error(err);
    renderError('加载页面时出现错误。', '请稍后再试或刷新页面。');
  });
});
