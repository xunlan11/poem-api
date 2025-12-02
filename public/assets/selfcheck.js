(function (global) {
  if (!global) return;
  const root = global;
  root.PoemEditor = root.PoemEditor || {};

  root.PoemEditor.initSelfCheck = function initSelfCheck(options = {}) {
    const documentRef = options.document || root.document;
    const windowRef = options.window || root;
    const Poem = options.Poem || root.Poem;
    const formContainer = options.formContainer || documentRef?.getElementById?.('formContainer') || null;
    const escapeHtml = options.escapeHtml || ((s) => String(s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));

    const SELF_CHECK_FIELD_CLASS = 'self-check-field';
    const SELF_CHECK_MESSAGE_CLASS = 'self-check-message';
    const SELF_CHECK_SPACE_SNIPPET_LIMIT = 12;
    const SELF_CHECK_SPACE_CONTEXT = 8;
    const SELF_CHECK_EMPTY_LINE_SNIPPET_LIMIT = 8;
    const VALID_PARAGRAPH_ENDINGS = ['。', '！', '？'];
    const CN_ELLIPSIS = '……';
    const TRAILING_ENCLOSURE_REGEX = /[)\]\}>'"\u201d\u2019\u3009\u300b\u300d\u300f\uff09\uff3d\uff3f\uff60\u3011\u3015\u3017\u3019\uff5d]/;
    const PAIRED_SYMBOLS = [
      { open: '“', close: '”', label: '“”' },
      { open: '‘', close: '’', label: '‘’' },
      { open: '《', close: '》', label: '《》' },
      { open: '（', close: '）', label: '（）' },
    ];
    const ENGLISH_PUNCTUATION_MAP = {
      ',': '，',
      '.': '。',
      '?': '？',
      '!': '！',
      ';': '；',
      ':': '：',
      '(': '（',
      ')': '）',
      '<': '《',
      '>': '》'
    };
    const ILLEGAL_SYMBOLS = [
      { char: '「', label: '「' },
      { char: '」', label: '」' },
      { char: '『', label: '『' },
      { char: '』', label: '』' },
      { char: '【', label: '【' },
      { char: '】', label: '' },
      { char: '〔', label: '〔' },
      { char: '〕', label: '〕' },
      { char: '〈', label: '〈' },
      { char: '〉', label: '〉' },
      { char: '{', label: '{' },
      { char: '}', label: '}' }
    ];
    const ILLEGAL_SYMBOL_LOOKUP = ILLEGAL_SYMBOLS.reduce((acc, item) => {
      acc[item.char] = item;
      return acc;
    }, {});
    let selfCheckQueue = [];
    const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'tel', 'email']);

    function isInCommonMeta(el) {
      if (!el || typeof el.closest !== 'function') return false;
      return !!el.closest('.common-meta');
    }

    function clearSelfCheckIndicators() {
      if (!documentRef) return;
      documentRef.querySelectorAll('.self-check-wrapper').forEach(el => el.remove());
      documentRef.querySelectorAll(`.${SELF_CHECK_FIELD_CLASS}`).forEach(el => el.classList.remove(SELF_CHECK_FIELD_CLASS));
      selfCheckQueue = [];
    }

    function getFieldLabel(el) {
      if (!el) return '未命名字段';
      const byFor = el.id ? documentRef.querySelector(`label[for="${el.id}"]`) : null;
      if (byFor && byFor.textContent) return byFor.textContent.trim();
      const fieldWrap = el.closest?.('.field');
      if (fieldWrap) {
        const labelEl = fieldWrap.querySelector('label');
        if (labelEl && labelEl.textContent) return labelEl.textContent.trim();
      }
      if (el.dataset && el.dataset.linkField) return el.dataset.linkField;
      if (el.name) return el.name;
      return el.id || '未命名字段';
    }

    function insertAfterField(target, node) {
      if (!target || !node) return;
      const anchorId = target.dataset ? target.dataset.selfCheckAnchor : '';
      if (anchorId) {
        const scope = target.closest?.('.field') || formContainer || documentRef;
        const anchorEl = scope?.querySelector?.(`#${anchorId}`) || documentRef?.getElementById?.(anchorId);
        if (anchorEl && anchorEl.parentNode) {
          anchorEl.parentNode.insertBefore(node, anchorEl);
          return;
        }
      }
      let anchor = target;
      let next = anchor?.nextElementSibling;
      while (next && next.classList && next.classList.contains('link-field-display')) {
        anchor = next;
        next = anchor.nextElementSibling;
      }
      if (anchor && typeof anchor.insertAdjacentElement === 'function') {
        anchor.insertAdjacentElement('afterend', node);
      } else if (target.parentNode) {
        target.parentNode.appendChild(node);
      } else {
        documentRef?.body?.appendChild?.(node);
      }
    }

    function queueSelfCheckMessage(target, type, payload) {
      if (!target) return;
      const entry = {
        target,
        kind: type === 'auto' ? 'auto' : 'manual',
        category: payload && payload.category ? payload.category : '',
        count: payload && typeof payload.count === 'number' ? payload.count : 0,
        detail: payload && payload.detail ? payload.detail : '',
      };
      selfCheckQueue.push(entry);
    }

    function summarizeIssues(entries, unit, includeTotal) {
      const counts = new Map();
      entries.forEach(entry => {
        const label = entry.category || '其他';
        const value = typeof entry.count === 'number' ? entry.count : 0;
        counts.set(label, (counts.get(label) || 0) + value);
      });
      const parts = [];
      counts.forEach((value, label) => {
        if (value > 0) parts.push(`${label} ${value} ${unit}`);
      });
      if (includeTotal && counts.size) {
        const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
        parts.push(`总共 ${total} 处`);
      }
      return parts.join('；');
    }

    function renderIssueGroups(entries) {
      const groups = new Map();
      entries.forEach(entry => {
        const key = entry.category || '其他';
        if (!groups.has(key)) groups.set(key, []);
        if (entry.detail) groups.get(key).push(entry.detail);
      });
      if (!groups.size) return null;
      const container = documentRef.createElement('div');
      container.className = 'self-check-issue-groups';
      groups.forEach((details, label) => {
        const block = documentRef.createElement('div');
        block.className = 'self-check-issue-group';
        const labelEl = documentRef.createElement('div');
        labelEl.className = 'self-check-issue-label';
        labelEl.textContent = `${label}：`;
        block.appendChild(labelEl);
        if (details.length) {
          const detailEl = documentRef.createElement('div');
          detailEl.className = 'self-check-issue-detail';
          detailEl.innerHTML = details.join('');
          block.appendChild(detailEl);
        }
        container.appendChild(block);
      });
      return container;
    }

    function createIssueBox(entries, options) {
      if (!entries.length) return null;
      const { title, className, unit, includeTotal } = options;
      const box = documentRef.createElement('div');
      box.className = `self-check-group ${className}`;
      const summaryText = summarizeIssues(entries, unit, includeTotal);
      const summaryEl = documentRef.createElement('div');
      summaryEl.className = 'self-check-group-summary';
      summaryEl.textContent = summaryText ? `${title}：${summaryText}` : `${title}：-`;
      box.appendChild(summaryEl);
      const groupEl = renderIssueGroups(entries);
      if (groupEl) box.appendChild(groupEl);
      return box;
    }

    function renderQueuedSelfCheckMessages() {
      if (!selfCheckQueue.length) return;
      const grouped = new Map();
      selfCheckQueue.forEach(entry => {
        if (!grouped.has(entry.target)) {
          grouped.set(entry.target, { auto: [], manual: [], target: entry.target });
        }
        grouped.get(entry.target)[entry.kind].push(entry);
      });
      grouped.forEach((bucket) => {
        const { target, auto, manual } = bucket;
        if (!auto.length && !manual.length) return;
        const wrapper = documentRef.createElement('div');
        wrapper.className = 'self-check-wrapper';
        const autoBox = createIssueBox(auto, { title: '自动修复', className: 'self-check-group-auto', unit: '处', includeTotal: false });
        if (autoBox) wrapper.appendChild(autoBox);
        const manualBox = createIssueBox(manual, { title: '人工处理', className: 'self-check-group-manual', unit: '处', includeTotal: true });
        if (manualBox) wrapper.appendChild(manualBox);
        insertAfterField(target, wrapper);
      });
      selfCheckQueue = [];
    }

    function renderSpaceSpan(ch) {
      if (ch === '\t') return '<span class="self-check-space-char" data-space-type="tab">[tab]</span>';
      if (ch === '\u3000') return '<span class="self-check-space-char" data-space-type="full">[全角空格]</span>';
      if (ch === '\u00a0') return '<span class="self-check-space-char" data-space-type="nbsp">[nbsp]</span>';
      return '<span class="self-check-space-char" data-space-type="space">&nbsp;</span>';
    }

    function removeEmptyLines(el) {
      if (!el || typeof el.value !== 'string') return 0;
      const value = el.value;
      if (!value) return 0;
      const lines = value.split(/\r?\n/);
      const hasContentLine = lines.some(line => line.trim().length > 0);
      if (!hasContentLine) return 0;
      let removed = 0;
      const kept = [];
      const snippets = [];
      const findPrevContent = (idx) => {
        for (let i = idx - 1; i >= 0; i -= 1) {
          if (lines[i] && lines[i].trim()) return lines[i];
        }
        return '';
      };
      const findNextContent = (idx) => {
        for (let i = idx + 1; i < lines.length; i += 1) {
          if (lines[i] && lines[i].trim()) return lines[i];
        }
        return '';
      };
      lines.forEach((line, idx) => {
        if (line.trim() === '') {
          removed += 1;
          if (snippets.length < SELF_CHECK_EMPTY_LINE_SNIPPET_LIMIT) {
            const before = findPrevContent(idx).slice(-SELF_CHECK_SPACE_CONTEXT);
            const after = findNextContent(idx).slice(0, SELF_CHECK_SPACE_CONTEXT);
            const snippet = `${escapeHtml(before)}<span class="self-check-space-char" data-space-type="blank-line">[空行]</span>${escapeHtml(after)}`;
            snippets.push(`<div class="self-check-inline-snippet" title="第${idx + 1}行">${snippet}</div>`);
          }
        } else {
          kept.push(line);
        }
      });
      if (!removed) return 0;
      const normalized = kept.join('\n');
      if (normalized !== value) {
        el.value = normalized;
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { }
      }
      const moreHint = removed > snippets.length ? `<div class="self-check-inline-note">仅展示前 ${snippets.length} 处，共 ${removed} 处</div>` : '';
      const detail = `<div class="self-check-detail-block self-check-auto-block"><div class="self-check-auto-detail">${snippets.join('')}${moreHint}</div></div>`;
      queueSelfCheckMessage(el, 'auto', { category: '空行', count: removed, detail });
      el.classList.add(SELF_CHECK_FIELD_CLASS);
      return removed;
    }

    function highlightInputSpaces(el) {
      if (!el || typeof el.value !== 'string') return 0;
      const value = el.value;
      if (!value) return 0;
      let count = 0;
      const sanitizedParts = [];
      const snippets = [];
      for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        const isSpace = ch === ' ' || ch === '\t' || ch === '\u00a0' || ch === '\u3000';
        if (!isSpace && ch !== '\r') {
          sanitizedParts.push(ch);
        }
        if (isSpace) {
          count += 1;
          if (snippets.length < SELF_CHECK_SPACE_SNIPPET_LIMIT) {
            const { before, after } = getCharContext(value, i, SELF_CHECK_SPACE_CONTEXT);
            const snippet = `${escapeHtml(before)}${renderSpaceSpan(ch)}${escapeHtml(after)}`;
            snippets.push(`<div class="self-check-inline-snippet">${snippet}</div>`);
          }
        }
      }
      if (!count) return 0;
      const sanitizedValue = sanitizedParts.join('');
      if (sanitizedValue !== value) {
        el.value = sanitizedValue;
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { }
      }
      const snippetList = snippets.join('');
      const moreHint = count > snippets.length ? `<div class="self-check-inline-note">仅展示前 ${snippets.length} 处，共 ${count} 处</div>` : '';
      const detail = `<div class="self-check-detail-block self-check-auto-block"><div class="self-check-auto-detail">${snippetList}${moreHint}</div></div>`;
      queueSelfCheckMessage(el, 'auto', { category: '空格', count, detail });
      el.classList.add(SELF_CHECK_FIELD_CLASS);
      return count;
    }

    function isTextLikeField(el) {
      if (!el) return false;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName !== 'INPUT') return false;
      const type = (el.type || '').toLowerCase();
      return TEXT_INPUT_TYPES.has(type);
    }

    function getCharContext(value, index, radius) {
      if (!value || typeof value !== 'string') return { before: '', after: '' };
      const size = typeof radius === 'number' ? radius : 6;
      const before = value.slice(Math.max(0, index - size), index);
      const after = value.slice(index + 1, Math.min(value.length, index + 1 + size));
      return { before, after };
    }

    function collectUnmatchedPairSymbols(value, pair) {
      const lonely = [];
      const stack = [];
      let line = 1;
      let column = 1;
      for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        if (ch === '\n') {
          line += 1;
          column = 1;
          continue;
        }
        if (ch === '\r') continue;
        if (ch === pair.open) {
          stack.push({ index: i, line, column, char: pair.open });
        } else if (ch === pair.close) {
          if (stack.length) stack.pop();
          else lonely.push({ index: i, line, column, char: pair.close, role: 'close' });
        }
        column += 1;
      }
      while (stack.length) {
        const info = stack.pop();
        lonely.push({ index: info.index, line: info.line, column: info.column, char: info.char, role: 'open' });
      }
      return lonely.sort((a, b) => a.index - b.index);
    }

    function replaceEnglishPunctuation(el) {
      if (!isTextLikeField(el)) return 0;
      const value = typeof el.value === 'string' ? el.value : '';
      if (!value) return 0;
      let changed = false;
      let result = '';
      const replacements = [];
      const quoteState = { double: false, single: false };
      for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        let replacement;
        if (ch === '"') {
          replacement = quoteState.double ? '”' : '“';
          quoteState.double = !quoteState.double;
        } else if (ch === '\'') {
          replacement = quoteState.single ? '’' : '‘';
          quoteState.single = !quoteState.single;
        } else {
          replacement = ENGLISH_PUNCTUATION_MAP[ch];
        }
        if (replacement) {
          result += replacement;
          const before = value.slice(Math.max(0, i - 6), i);
          const after = value.slice(i + 1, Math.min(value.length, i + 7));
          replacements.push({ from: ch, to: replacement, before, after });
          changed = true;
        } else {
          result += ch;
        }
      }
      if (!changed) return 0;
      el.value = result;
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { }
      const snippetRows = replacements.map(rep => {
        const snippet = `${escapeHtml(rep.before)}<span class="self-check-inline-change" data-original="${escapeHtml(rep.from)}" title="原字符：${escapeHtml(rep.from)}">${escapeHtml(rep.to)}</span>${escapeHtml(rep.after)}`;
        return `<div class="self-check-inline-snippet">${snippet}</div>`;
      }).join('');
      const detail = `<div class="self-check-detail-block self-check-auto-block">${snippetRows}</div>`;
      queueSelfCheckMessage(el, 'auto', { category: '半角符号', count: replacements.length, detail });
      el.classList.add(SELF_CHECK_FIELD_CLASS);
      return replacements.length;
    }

    function flagIllegalSymbols(el) {
      if (!isTextLikeField(el)) return 0;
      const value = typeof el.value === 'string' ? el.value : '';
      if (!value) return 0;
      const hits = [];
      for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        if (!ILLEGAL_SYMBOL_LOOKUP[ch]) continue;
        const before = value.slice(Math.max(0, i - 6), i);
        const after = value.slice(i + 1, Math.min(value.length, i + 7));
        hits.push({ char: ch, before, after });
      }
      if (!hits.length) return 0;
      const rows = hits.map(hit => {
        const snippet = `${escapeHtml(hit.before)}<span class="self-check-illegal-char">${escapeHtml(hit.char)}</span>${escapeHtml(hit.after)}`;
        return `<div class="self-check-illegal-item">${snippet}</div>`;
      }).join('');
      const detail = `<div class="self-check-detail-block ${SELF_CHECK_MESSAGE_CLASS} self-check-illegal"><div class="self-check-illegal-list">${rows}</div></div>`;
      queueSelfCheckMessage(el, 'manual', { category: '禁用符号', count: hits.length, detail });
      el.classList.add(SELF_CHECK_FIELD_CLASS);
      return hits.length;
    }

    function checkPairedSymbols(el) {
      if (!isTextLikeField(el)) return 0;
      const value = typeof el.value === 'string' ? el.value : '';
      if (!value) return 0;
      const pairIssues = [];
      let totalLonely = 0;
      PAIRED_SYMBOLS.forEach(pair => {
        const unmatched = collectUnmatchedPairSymbols(value, pair);
        if (!unmatched.length) return;
        totalLonely += unmatched.length;
        pairIssues.push({ label: pair.label, unmatched });
      });
      if (!pairIssues.length) return 0;
      const rows = pairIssues.map(item => item.unmatched.map(info => {
        const { before, after } = getCharContext(value, info.index, 8);
        const snippet = `${escapeHtml(before)}<span class="self-check-pair-char" data-pair-role="${info.role || 'open'}">${escapeHtml(info.char)}</span>${escapeHtml(after)}`;
        const title = `第${info.line}行第${info.column}列 · ${item.label} 落单`;
        return `<div class="self-check-pair-item" title="${escapeHtml(title)}"><div class="self-check-inline-snippet">${snippet}</div></div>`;
      }).join('')).join('');
      const detail = `<div class="self-check-detail-block ${SELF_CHECK_MESSAGE_CLASS} self-check-pairs"><div class="self-check-pair-list">${rows}</div></div>`;
      queueSelfCheckMessage(el, 'manual', { category: '成对符号', count: totalLonely, detail });
      el.classList.add(SELF_CHECK_FIELD_CLASS);
      return totalLonely;
    }

    function isAutosizeTextarea(el) {
      if (!el || el.tagName !== 'TEXTAREA') return false;
      if (typeof el.__autosizeHandler === 'function') return true;
      try {
        if (el.dataset && el.dataset.autosize === 'true') return true;
        if (el.style && (el.style.resize === 'none' || el.style.overflow === 'hidden')) return true;
        const cs = windowRef.getComputedStyle ? windowRef.getComputedStyle(el) : null;
        if (cs && (cs.resize === 'none' || cs.overflowY === 'hidden')) return true;
      } catch (e) { }
      return false;
    }

    function stripTrailingClosers(text) {
      let result = text;
      while (result.length > 0) {
        const last = result[result.length - 1];
        if (TRAILING_ENCLOSURE_REGEX.test(last)) result = result.slice(0, -1);
        else break;
      }
      return result;
    }

    function hasBookTitlePair(text) {
      if (!text) return false;
      const openIdx = text.indexOf('《');
      if (openIdx === -1) return false;
      const closeIdx = text.indexOf('》', openIdx + 1);
      return closeIdx !== -1;
    }

    function ensureBookTitleBrackets(el, labelOverride) {
      if (!el || typeof el.value !== 'string') return 0;
      const value = el.value.trim();
      if (!value) return 0;
      if (hasBookTitlePair(value)) return 0;
      const label = labelOverride || getFieldLabel(el) || '';
      const labelText = label ? `“${label}”` : '该字段';
      const excerpt = value.length > 80 ? `${value.slice(0, 80)}…` : value;
      const detail = `<div class="self-check-detail-block ${SELF_CHECK_MESSAGE_CLASS} self-check-booktitle"><div class="self-check-inline-note">请使用《》标识作品。</div></div>`;
      queueSelfCheckMessage(el, 'manual', { category: '书名号', count: 1, detail });
      el.classList.add(SELF_CHECK_FIELD_CLASS);
      return 1;
    }

    function hasValidParagraphEnding(text) {
      if (!text) return false;
      if (text.endsWith(CN_ELLIPSIS)) return true;
      const lastChar = text[text.length - 1];
      return VALID_PARAGRAPH_ENDINGS.includes(lastChar);
    }

    function collectParagraphs(value) {
      const lines = value.split(/\r?\n/);
      return lines.reduce((acc, line, idx) => {
        if (line.trim()) {
          acc.push({ text: line, lineNumber: idx + 1 });
        }
        return acc;
      }, []);
    }

    function checkTextareaParagraphEnds(el) {
      if (!el || typeof el.value !== 'string') return 0;
      const value = el.value;
      if (!value || !value.trim()) return 0;
      const paragraphs = collectParagraphs(value);
      if (!paragraphs.length) return 0;
      const issues = [];
      paragraphs.forEach((para, idx) => {
        let content = para.text;
        if (!content) return;
        content = content.replace(/\s+$/, '');
        if (!content) return;
        const stripped = stripTrailingClosers(content);
        if (!stripped) return;
        if (!hasValidParagraphEnding(stripped)) {
          issues.push({ paragraph: idx + 1 });
        }
      });
      if (!issues.length) return 0;
      const rows = issues.map(item => `<div class="self-check-punct-item">第${item.paragraph}段</div>`).join('');
      const detail = `<div class="self-check-detail-block ${SELF_CHECK_MESSAGE_CLASS} self-check-punctuation"><div class="self-check-punct-list">${rows}</div></div>`;
      queueSelfCheckMessage(el, 'manual', { category: '段尾符号', count: issues.length, detail });
      el.classList.add(SELF_CHECK_FIELD_CLASS);
      return issues.length;
    }

    function runSelfCheck() {
      clearSelfCheckIndicators();
      const selectors = [
        'input:not([type])',
        'input[type="text"]',
        'input[type="search"]',
        'input[type="number"]',
        'input[type="url"]',
        'input[type="email"]',
        'input[type="tel"]',
        'input[type="date"]',
        'input[type="time"]',
        'input[type="datetime-local"]',
        'textarea'
      ];
      const fields = Array.from(documentRef.querySelectorAll(selectors.join(', '))).filter(el => !isInCommonMeta(el));
      let spaceIssues = 0;
      let emptyLineIssues = 0;
      let punctuationIssues = 0;
      let englishIssues = 0;
      let pairIssues = 0;
      let illegalSymbolIssues = 0;
      let bookTitleIssues = 0;
      fields.forEach(el => {
        if (!el || el.classList.contains('skip-self-check')) return;
        if (!el || typeof el.value !== 'string') return;
        emptyLineIssues += removeEmptyLines(el);
        spaceIssues += highlightInputSpaces(el);
        if (isTextLikeField(el)) {
          englishIssues += replaceEnglishPunctuation(el);
          illegalSymbolIssues += flagIllegalSymbols(el);
          pairIssues += checkPairedSymbols(el);
        }
        const needsParagraphCheck = (el.tagName === 'TEXTAREA' && isAutosizeTextarea(el)) || (el.dataset && el.dataset.checkParagraph === 'true');
        if (needsParagraphCheck) {
          punctuationIssues += checkTextareaParagraphEnds(el);
        }
      });

      const bookTitleTargets = [
        documentRef?.getElementById?.('f-source'),
        documentRef?.getElementById?.('f-works'),
        documentRef?.getElementById?.('f-repWorks'),
        documentRef?.getElementById?.('f-anthos'),
      ];
      bookTitleTargets.forEach(el => {
        if (!el) return;
        bookTitleIssues += ensureBookTitleBrackets(el);
      });
      renderQueuedSelfCheckMessages();
      const hasIssues = spaceIssues || englishIssues || illegalSymbolIssues || pairIssues || punctuationIssues || bookTitleIssues || emptyLineIssues;
      if (Poem && typeof Poem.toast === 'function') {
        Poem.toast(hasIssues ? '请及时修改' : '未发现问题');
      }
    }

    return { runSelfCheck, clearSelfCheckIndicators };
  };
})(typeof window !== 'undefined' ? window : this);
