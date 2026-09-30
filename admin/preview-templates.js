/**
 * Decap CMS Custom Preview Templates
 * ANPA Ensino Rabadeira — Warm Cream & Teal Design System
 */

(function () {
  const mesesGalego = [
    "xaneiro", "febreiro", "marzo", "abril", "maio", "xuño",
    "xullo", "agosto", "setembro", "outubro", "novembro", "decembro"
  ];

  function formatGalicianDate(dateValue) {
    if (!dateValue) return "";
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return String(dateValue);
    return `${d.getDate()} de ${mesesGalego[d.getMonth()]} de ${d.getFullYear()}`;
  }

  // ===== POST / NOTICIA PREVIEW =====
  const PostPreview = createClass({
    render: function () {
      const entry = this.props.entry;
      const title = entry.getIn(['data', 'title']) || 'Título da nova';
      const date = entry.getIn(['data', 'date']);
      const category = entry.getIn(['data', 'category']) || 'Novas';
      const image = entry.getIn(['data', 'image']);
      const imageSrc = image ? this.props.getAsset(image) : null;
      const formattedDate = date ? formatGalicianDate(date) : '';

      return h('div', { className: 'preview-root' },
        h('article', { className: 'post-single container' },
          h('a', { href: '#', className: 'post-single__back', onClick: (e) => e.preventDefault() }, '← Voltar a Novas'),
          h('header', null,
            category ? h('span', { className: 'post-single__category' }, category) : null,
            h('h1', null, title),
            formattedDate ? h('time', { className: 'post-single__date' }, `📅 ${formattedDate}`) : null,
            imageSrc ? h('img', { src: imageSrc.toString(), alt: title, className: 'post-single__image' }) : null
          ),
          h('div', { className: 'post-content' }, this.props.widgetFor('body'))
        )
      );
    }
  });

  // ===== EXTRAESCOLARES PREVIEW =====
  const ExtraescolaresPreview = createClass({
    render: function () {
      const entry = this.props.entry;
      const data = entry.getIn(['data']).toJS();
      const academicYear = data.academic_year || '2026-2027';
      const scheduleImg = data.schedule_image ? this.props.getAsset(data.schedule_image) : null;
      const activities = data.activities || [];
      const membership = data.membership || {};
      const pricingTable = data.pricing_table || [];

      return h('div', { className: 'preview-root container' },
        h('h1', { style: { marginTop: '1.5rem', marginBottom: '1rem', color: '#13406a' } }, `Actividades Extraescolares ${academicYear}`),
        data.intro ? h('p', null, data.intro) : null,
        data.subintro ? h('p', null, data.subintro) : null,

        // Horario oficial
        scheduleImg ? h('div', { className: 'schedule-card', style: { margin: '2rem 0' } },
          h('div', { className: 'schedule-card__header' },
            h('h3', { className: 'schedule-card__title' }, `Horario Xeral Extraescolares (${academicYear})`)
          ),
          h('div', { className: 'schedule-card__scroll' },
            h('img', { src: scheduleImg.toString(), alt: `Horario ${academicYear}`, className: 'schedule-card__img' })
          )
        ) : null,

        data.deadlines_note ? h('p', null, data.deadlines_note) : null,

        // Alta de socio
        membership.title ? h('div', { className: 'callout-box', style: { margin: '2rem 0' } },
          h('h3', null, membership.title),
          membership.non_member_note ? h('p', null, membership.non_member_note) : null,
          h('div', { className: 'callout-box__actions' },
            membership.join_label ? h('span', { className: 'btn-action' }, membership.join_label) : null,
            membership.non_member_label ? h('span', { className: 'btn-action' }, membership.non_member_label) : null
          )
        ) : null,

        // Listado de actividades
        h('h2', { style: { marginTop: '2rem', marginBottom: '1rem' } }, `Listado de actividades (${activities.length})`),
        h('div', { className: 'activity-cards' },
          activities.map((act, index) => {
            let badge = null;
            if (act.status === 'full') {
              badge = h('span', { className: 'status-badge status-badge--full' }, 'Completa');
            } else if (act.status === 'partial') {
              badge = h('span', { className: 'status-badge status-badge--partial' }, 'Parcialmente completa');
            }

            return h('article', { key: act.id || index, className: 'activity-card' },
              h('div', { className: 'activity-card__header' },
                h('h3', { className: 'activity-card__title' }, act.name || 'Actividade'),
                badge
              ),
              h('div', { className: 'activity-card__details' },
                h('span', { className: 'activity-card__detail-item' }, h('strong', null, 'Etapa: '), act.stage || ''),
                h('span', { className: 'activity-card__detail-item' }, h('strong', null, 'Prezo: '), act.price || ''),
                act.provider ? h('span', { className: 'activity-card__detail-item' }, h('strong', null, 'Imparte: '), act.provider) : null
              ),
              act.status_note ? h('p', { className: 'activity-card__note' }, act.status_note) : null,
              act.status !== 'full' && act.registration_url ? h('div', null,
                h('span', { className: 'btn-action' }, act.button_label || 'Inscrición')
              ) : null
            );
          })
        ),

        // Cadro de tarifas
        pricingTable.length > 0 ? h('div', { style: { marginTop: '2.5rem' } },
          h('h2', null, `Cadro de tarifas e cotas (${academicYear})`),
          h('div', { className: 'pricing-table-container' },
            h('table', { className: 'pricing-table' },
              h('thead', null,
                h('tr', null,
                  h('th', null, 'Actividade'),
                  h('th', null, 'Horas'),
                  h('th', null, 'Cota mensual')
                )
              ),
              h('tbody', null,
                pricingTable.map((item, idx) =>
                  h('tr', { key: idx },
                    h('td', null, h('strong', null, item.name)),
                    h('td', null, item.hours),
                    h('td', null, item.price)
                  )
                )
              )
            )
          )
        ) : null
      );
    }
  });

  // Rexistrar estilos e compoñentes no CMS
  if (window.CMS) {
    CMS.registerPreviewStyle('/css/style.css');
    CMS.registerPreviewTemplate('posts', PostPreview);
    CMS.registerPreviewTemplate('extraescolares', ExtraescolaresPreview);
  }
})();
