function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class DataTable {
  constructor({
    title,
    titleHtml = '',
    columns,
    emptyMessage = 'No data yet.',
    rowKey = (row) => row.id,
    initialSort = null,
  }) {
    this.title = title;
    this.titleHtml = titleHtml;
    this.columns = columns;
    this.emptyMessage = emptyMessage;
    this.rowKey = rowKey;
    this.sortState = initialSort;
    this.root = null;
    this.body = null;
    this.headerButtons = [];
  }

  mount(parent) {
    this.root = document.createElement('section');
    this.root.className = 'panel-card table-card';
    this.root.innerHTML = `
      <div class="panel-head">
        <h3>${this.titleHtml || escapeHtml(this.title)}</h3>
      </div>
      <div class="table-shell">
        <table>
          <thead>
            <tr>${this.columns.map((column) => `
              <th>
                ${column.sortable === false
                  ? escapeHtml(column.label)
                  : `<button type="button" class="table-sort-button" data-column="${escapeHtml(column.key)}">${escapeHtml(column.label)}</button>`}
              </th>
            `).join('')}</tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;

    this.body = this.root.querySelector('tbody');
    this.headerButtons = [...this.root.querySelectorAll('[data-column]')];

    for (const button of this.headerButtons) {
      button.addEventListener('click', () => {
        const key = button.dataset.column;

        if (!this.sortState || this.sortState.key !== key) {
          this.sortState = { key, direction: 'asc' };
        } else {
          this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
        }

        this.root.dispatchEvent(new CustomEvent('table-sort-changed', { bubbles: true }));
      });
    }

    parent.appendChild(this.root);
  }

  getSortedRows(rows) {
    if (!this.sortState) {
      return rows;
    }

    const column = this.columns.find((item) => item.key === this.sortState.key);

    if (!column) {
      return rows;
    }

    const directionMultiplier = this.sortState.direction === 'asc' ? 1 : -1;
    const valueOf = column.sortValue ?? ((row) => row[column.key]);

    return [...rows].sort((left, right) => {
      const a = valueOf(left);
      const b = valueOf(right);

      if (typeof a === 'number' && typeof b === 'number') {
        return (a - b) * directionMultiplier;
      }

      return String(a).localeCompare(String(b)) * directionMultiplier;
    });
  }

  update(rows, options = {}) {
    if (!this.body) {
      return;
    }

    const sortedRows = this.getSortedRows(rows);

    if (sortedRows.length === 0) {
      this.body.innerHTML = `<tr><td colspan="${this.columns.length}" class="table-empty">${escapeHtml(this.emptyMessage)}</td></tr>`;
      return;
    }

    for (const button of this.headerButtons) {
      const isActive = this.sortState?.key === button.dataset.column;
      button.classList.toggle('is-active', isActive);
      button.dataset.direction = isActive ? this.sortState.direction : '';
    }

    this.body.innerHTML = sortedRows
      .map((row) => {
        const key = this.rowKey(row);
        const rowClass = [
          row.rowClass ?? '',
          options.selectedKey === key ? 'is-selected' : '',
        ].filter(Boolean).join(' ');

        return `<tr class="${rowClass}" data-row-key="${escapeHtml(key ?? '')}">${this.columns.map((column) => {
          if (column.renderHtml) {
            return `<td>${column.renderHtml(row)}</td>`;
          }

          const value = column.render ? column.render(row) : row[column.key];
          return `<td>${escapeHtml(value ?? '-')}</td>`;
        }).join('')}</tr>`;
      })
      .join('');
  }

  destroy() {
    this.root?.remove();
    this.root = null;
    this.body = null;
    this.headerButtons = [];
  }
}
