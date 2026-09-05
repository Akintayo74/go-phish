import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderMarkdown, Markdown } from './markdown.jsx';

function renderMd(md) {
  return render(<div data-testid="md">{renderMarkdown(md)}</div>).getByTestId('md');
}

describe('renderMarkdown', () => {
  it('renders headings at the right level', () => {
    const el = renderMd('# Title\n\n## Subtitle\n\n### Small');
    expect(el.querySelector('h1')).toHaveTextContent('Title');
    expect(el.querySelector('h2')).toHaveTextContent('Subtitle');
    expect(el.querySelector('h3')).toHaveTextContent('Small');
  });

  it('renders paragraphs, joining wrapped lines', () => {
    const el = renderMd('First line\nsecond line.\n\nA new paragraph.');
    const ps = el.querySelectorAll('p');
    expect(ps).toHaveLength(2);
    expect(ps[0]).toHaveTextContent('First line second line.');
    expect(ps[1]).toHaveTextContent('A new paragraph.');
  });

  it('renders unordered and ordered lists', () => {
    const el = renderMd('- one\n- two\n\n1. first\n2. second');
    expect(el.querySelectorAll('ul li')).toHaveLength(2);
    expect(el.querySelectorAll('ol li')).toHaveLength(2);
    expect(el.querySelector('ul li')).toHaveTextContent('one');
    expect(el.querySelector('ol li')).toHaveTextContent('first');
  });

  it('renders blockquotes', () => {
    const el = renderMd('> a warning\n> continued');
    expect(el.querySelector('blockquote')).toHaveTextContent('a warning continued');
  });

  it('renders inline bold, code, and links', () => {
    const el = renderMd('Use **MFA** and run `npm test` then see [docs](https://example.test).');
    expect(el.querySelector('strong')).toHaveTextContent('MFA');
    expect(el.querySelector('code')).toHaveTextContent('npm test');
    const link = el.querySelector('a');
    expect(link).toHaveTextContent('docs');
    expect(link).toHaveAttribute('href', 'https://example.test');
  });

  it('allows site-relative and mailto links', () => {
    const el = renderMd('[home](/#/learn) or [mail](mailto:a@b.test)');
    const links = el.querySelectorAll('a');
    expect(links[0]).toHaveAttribute('href', '/#/learn');
    expect(links[1]).toHaveAttribute('href', 'mailto:a@b.test');
  });

  it('joins a wrapped bullet into one list item', () => {
    const el = renderMd(
      ['- A sender whose display name looks right but the', '  domain is wrong.', '- Second item'].join('\n')
    );
    expect(el.querySelectorAll('ul')).toHaveLength(1);
    const items = el.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('display name looks right but the domain is wrong.');
    expect(el.querySelector('p')).toBeNull();
  });

  it('joins a wrapped numbered step into one list item', () => {
    const el = renderMd(['1. Disconnect the device if you ran', '   anything.', '2. Report it.'].join('\n'));
    expect(el.querySelectorAll('ol')).toHaveLength(1);
    const items = el.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Disconnect the device if you ran anything.');
  });

  it('keeps a wrapped link intact across the line break', () => {
    const el = renderMd(['- [Secure Our World](https://www.cisa.gov/secure-our-world)', "  — CISA's four habits."].join('\n'));
    const link = el.querySelector('li a');
    expect(link).toHaveAttribute('href', 'https://www.cisa.gov/secure-our-world');
    expect(el.querySelector('li')).toHaveTextContent("— CISA's four habits.");
  });

  it('opens external links in a new tab with a safe rel', () => {
    const el = renderMd('See [CISA](https://www.cisa.gov/secure-our-world).');
    const link = el.querySelector('a');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps in-site and mailto links in the same tab', () => {
    const el = renderMd('[home](/#/learn) or [mail](mailto:a@b.test)');
    for (const link of el.querySelectorAll('a')) {
      expect(link).not.toHaveAttribute('target');
      expect(link).not.toHaveAttribute('rel');
    }
  });

  it('drops an unsafe javascript: link but keeps its label as text', () => {
    const el = renderMd('[click](javascript:alert(1))');
    expect(el.querySelector('a')).toBeNull();
    expect(el).toHaveTextContent('click');
  });

  it('never emits a script element from content', () => {
    const el = renderMd('Text with <script>alert(1)</script> inside.');
    expect(el.querySelector('script')).toBeNull();
  });

  it('handles empty / non-string input without throwing', () => {
    expect(renderMarkdown('')).toEqual([]);
    expect(renderMarkdown(undefined)).toEqual([]);
    expect(renderMarkdown(null)).toEqual([]);
  });

  it('Markdown component wraps renderMarkdown', () => {
    const { getByTestId } = render(
      <div data-testid="wrap">
        <Markdown># Heading</Markdown>
      </div>
    );
    expect(getByTestId('wrap').querySelector('h1')).toHaveTextContent('Heading');
  });
});
