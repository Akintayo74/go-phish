import React from 'react';

// Minimal, dependency-free Markdown → React renderer for the CAT learning site
// (Phase 6). It supports the small subset the lesson content actually uses:
// headings (#..###), paragraphs, unordered/ordered lists, blockquotes, and the
// inline spans **bold**, `code`, and [text](url).
//
// It builds React elements directly (never dangerouslySetInnerHTML), so authored
// content cannot inject markup or script into the page. Links are additionally
// restricted to safe schemes (http/https/mailto and site-relative), so a
// `javascript:` URL in content can never become a live handler.

function isSafeHref(href) {
  if (!href) return false;
  const trimmed = href.trim();
  // Site-relative and anchor links are always fine.
  if (/^(\/|#|\.\/|\.\.\/)/.test(trimmed)) return true;
  return /^(https?:|mailto:)/i.test(trimmed);
}

// Parse inline spans within a line into React nodes. Order matters: we scan
// left to right and match the earliest of code / bold / link at each step.
function parseInline(text, keyPrefix) {
  const nodes = [];
  let remaining = text;
  let i = 0;

  // Matches `code`, **bold**, or [label](href) — whichever comes first.
  const pattern = /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/;

  while (remaining) {
    const m = pattern.exec(remaining);
    if (!m) {
      nodes.push(remaining);
      break;
    }
    if (m.index > 0) {
      nodes.push(remaining.slice(0, m.index));
    }
    const key = `${keyPrefix}-i${i++}`;
    if (m[1] !== undefined) {
      nodes.push(<code key={key}>{m[2]}</code>);
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={key}>{m[4]}</strong>);
    } else if (m[5] !== undefined) {
      const label = m[6];
      const href = m[7];
      if (isSafeHref(href)) {
        nodes.push(
          <a key={key} href={href.trim()}>
            {label}
          </a>
        );
      } else {
        // Unsafe scheme: render the label as plain text, drop the link.
        nodes.push(label);
      }
    }
    remaining = remaining.slice(m.index + m[0].length);
  }

  return nodes;
}

// Group raw lines into block elements and render each block.
export function renderMarkdown(markdown) {
  const source = typeof markdown === 'string' ? markdown : '';
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  const blocks = [];
  let i = 0;
  let blockKey = 0;

  const nextKey = () => `b${blockKey++}`;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip (block separators are handled per-type).
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Heading: #, ##, ###.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 6);
      const Tag = `h${level}`;
      const key = nextKey();
      blocks.push(
        <Tag key={key}>{parseInline(heading[2], key)}</Tag>
      );
      i += 1;
      continue;
    }

    // Blockquote: one or more consecutive `>` lines.
    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      const key = nextKey();
      blocks.push(
        <blockquote key={key}>{parseInline(quoteLines.join(' '), key)}</blockquote>
      );
      continue;
    }

    // Unordered list: consecutive `- ` lines.
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i += 1;
      }
      const key = nextKey();
      blocks.push(
        <ul key={key}>
          {items.map((item, idx) => (
            <li key={`${key}-${idx}`}>{parseInline(item, `${key}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list: consecutive `1. ` lines.
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      const key = nextKey();
      blocks.push(
        <ol key={key}>
          {items.map((item, idx) => (
            <li key={`${key}-${idx}`}>{parseInline(item, `${key}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines.
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    const key = nextKey();
    blocks.push(<p key={key}>{parseInline(paraLines.join(' '), key)}</p>);
  }

  return blocks;
}

// Convenience component wrapper.
export function Markdown({ children }) {
  return <>{renderMarkdown(children)}</>;
}
