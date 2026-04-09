export class SetupPanel {
  constructor({ title, description, fields, renderField }) {
    this.title = title;
    this.description = description;
    this.fields = fields;
    this.renderField = renderField;
    this.root = null;
  }

  mount(parent) {
    this.root = document.createElement('section');
    this.root.className = 'panel-card setup-panel';
    this.root.innerHTML = `
      <div class="setup-panel-head">
        <h3>${this.title}</h3>
        <p>${this.description}</p>
      </div>
      <div class="setup-fields">
        ${this.fields.map((field) => this.renderField(field)).join('')}
      </div>
    `;

    parent.appendChild(this.root);
  }

  destroy() {
    this.root?.remove();
    this.root = null;
  }
}
