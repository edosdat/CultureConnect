import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomeTop3BootFallback from './HomeTop3BootFallback';
import { homeBootFilterChrome } from '../lib/displayHome';

describe('HomeTop3BootFallback — filter chrome reservation', () => {
  it('renders inert filter chrome above the Top 3 skeleton', () => {
    const html = renderToStaticMarkup(createElement(HomeTop3BootFallback));
    const chrome = homeBootFilterChrome();

    assert.ok(html.includes('data-home-filter-chrome="search"'));
    assert.ok(html.includes('data-home-filter-chrome="examples"'));
    assert.ok(html.includes('data-home-filter-chrome="quand-quoi"'));
    assert.ok(html.includes('data-home-filter-chrome="where-month"'));
    assert.ok(html.includes('data-top3-boot-fallback'));
    assert.ok(
      html.indexOf('data-home-filter-chrome="search"') <
        html.indexOf('data-top3-boot-fallback'),
      'filter chrome must paint above Top 3',
    );

    assert.ok(html.includes(chrome.searchPlaceholder));
    for (const label of chrome.exampleLabels) {
      assert.ok(html.includes(label), `missing example ${label}`);
    }
    for (const label of chrome.dateChipLabels) {
      assert.ok(html.includes(label), `missing date chip ${label}`);
    }
    assert.ok(html.includes(chrome.commune));
    assert.ok(html.includes(chrome.nearMe));
    assert.ok(html.includes(chrome.monthLink));
    assert.ok(html.includes(chrome.filtersLabel));
    assert.ok(html.includes('Le top 3 du moment'));
  });
});
