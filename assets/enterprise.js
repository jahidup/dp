(function () {
  const state = {
    resultCategories: [],
    galleryCategories: [],
    galleryItems: [],
    adminResults: [],
    adminGallery: []
  };

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async function api(path, options = {}) {
    const headers = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
    const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...headers, ...(options.headers || {}) } });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function toast(message, isError) {
    const node = document.createElement('div');
    node.className = 'notice';
    node.textContent = message;
    Object.assign(node.style, {
      position: 'fixed',
      right: '1rem',
      bottom: '1rem',
      zIndex: 5000,
      background: isError ? '#fff1f0' : '#eefbf5',
      color: isError ? '#a61912' : '#106b4b',
      maxWidth: '360px'
    });
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }

  function parseSubjectsInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];
    if (raw.startsWith('[')) {
      try {
        return JSON.parse(raw);
      } catch (err) {
        return [];
      }
    }
    return raw.split(/\n+/).map(line => {
      const [subject, marksObtained, maxMarks, grade, remarks] = line.split('|').map(part => part.trim());
      return { subject, marksObtained: Number(marksObtained || 0), maxMarks: Number(maxMarks || 100), grade, remarks };
    }).filter(row => row.subject);
  }

  async function applyBranding() {
    try {
      const { branding } = await api('/api/settings/public');
      if (!branding) return;
      document.documentElement.style.setProperty('--primary', branding.primaryColor || '#00acee');
      document.documentElement.style.setProperty('--enterprise-blue', branding.primaryColor || '#00acee');
      $all('img').forEach(img => {
        const alt = (img.getAttribute('alt') || '').toLowerCase();
        const src = img.getAttribute('src') || '';
        if (alt.includes('logo') || src.includes('SANKALP-SHIKSHA-N-LOGO')) img.src = branding.logoUrl;
      });
      const favicon = $('link[rel="icon"]') || document.createElement('link');
      favicon.rel = 'icon';
      favicon.href = branding.faviconUrl;
      if (!favicon.parentNode) document.head.appendChild(favicon);
    } catch (err) {
      // Public pages keep their static branding when settings are unavailable.
    }
  }

  async function initResultPortal() {
    const form = $('#enterpriseResultForm');
    if (!form) return;
    const categorySelect = $('#resultCategory');
    const output = $('#enterpriseResultOutput');
    const status = $('#resultStatus');
    try {
      state.resultCategories = await api('/api/result/categories');
      categorySelect.innerHTML = state.resultCategories.map(category => (
        `<option value="${escapeHtml(category.slug)}" data-mode="${escapeHtml(category.mode)}">${escapeHtml(category.name)}</option>`
      )).join('');
      renderResultMode();
    } catch (err) {
      status.textContent = 'Could not load categories. Please refresh once.';
    }

    categorySelect?.addEventListener('change', renderResultMode);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      status.textContent = 'Verifying result...';
      output.innerHTML = '<div class="notice">Checking credentials securely.</div>';
      const type = $('#resultIdentifierType').value;
      const identifier = $('#resultIdentifier').value.trim();
      const body = {
        categorySlug: categorySelect.value,
        dob: $('#resultDob').value
      };
      body[type] = identifier;
      try {
        const data = await api('/api/result/check', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        status.textContent = 'Verified result found.';
        renderResult(data.result);
      } catch (err) {
        status.textContent = err.message;
        output.innerHTML = '<div class="notice">No matching published result was found for the submitted details.</div>';
      }
    });

    $('#resultPrintBtn')?.addEventListener('click', () => window.print());
    $('#resultDownloadBtn')?.addEventListener('click', () => window.print());

    function renderResultMode() {
      const selected = categorySelect?.selectedOptions?.[0];
      const mode = selected?.dataset.mode || 'dynamic';
      $all('.mode-pill').forEach(pill => pill.classList.toggle('is-active', pill.dataset.mode === mode));
    }

    function renderResult(result) {
      const mode = result.resultMode || 'dynamic';
      const photo = result.photoUrl || 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=300&q=80';
      const fields = result.fields || {};
      const customFields = Object.keys(fields).length ? `
        <div class="detail-grid mt-3">
          ${Object.entries(fields).map(([key, value]) => `
            <div class="detail-item"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>
          `).join('')}
        </div>
      ` : '';
      const header = `
        <div class="result-student-head">
          <img class="student-photo" src="${escapeHtml(photo)}" alt="${escapeHtml(result.studentName)} photo">
          <div>
            <p class="enterprise-eyebrow">Verified ${escapeHtml(mode)} result</p>
            <h2 class="enterprise-title" style="font-size:2rem;">${escapeHtml(result.studentName)}</h2>
            <div class="detail-grid">
              <div class="detail-item"><span>Registration</span><strong>${escapeHtml(result.registrationNumber)}</strong></div>
              <div class="detail-item"><span>Roll Number</span><strong>${escapeHtml(result.rollNumber || 'Not set')}</strong></div>
              <div class="detail-item"><span>Class</span><strong>${escapeHtml(result.className || result.class || '')}</strong></div>
              <div class="detail-item"><span>Session</span><strong>${escapeHtml(result.session || '')}</strong></div>
            </div>
          </div>
        </div>
      `;

      if (mode === 'pdf' && result.pdfUrl) {
        output.innerHTML = `
          ${header}
          <div class="summary-grid mb-3">
            <div class="summary-item"><span>Grade</span><strong>${escapeHtml(result.grade || '')}</strong></div>
            <div class="summary-item"><span>Remarks</span><strong>${escapeHtml(result.remarks || '')}</strong></div>
            <div class="summary-item"><span>Verification</span><strong>${escapeHtml(result.verificationCode || '')}</strong></div>
          </div>
          <iframe class="pdf-frame" src="${escapeHtml(result.pdfUrl)}" title="PDF marksheet"></iframe>
          <div class="admin-actions mt-3">
            <a class="btn-primary" href="${escapeHtml(result.pdfUrl)}" target="_blank" rel="noopener noreferrer">Open PDF</a>
            <a class="btn-subtle" href="${escapeHtml(result.pdfUrl)}" download>Download</a>
          </div>
        `;
        return;
      }

      if (mode === 'link' && result.externalUrl) {
        output.innerHTML = `
          ${header}
          <div class="summary-grid mb-3">
            <div class="summary-item"><span>Grade</span><strong>${escapeHtml(result.grade || '')}</strong></div>
            <div class="summary-item"><span>Rank</span><strong>${escapeHtml(result.rank || '')}</strong></div>
            <div class="summary-item"><span>Verification</span><strong>${escapeHtml(result.verificationCode || '')}</strong></div>
          </div>
          <div class="notice">This result is published as a secure digital marksheet link.</div>
          <div class="admin-actions mt-3">
            <a class="btn-primary" href="${escapeHtml(result.externalUrl)}" target="_blank" rel="noopener noreferrer">View Marksheet</a>
            <a class="btn-subtle" href="${escapeHtml(result.externalUrl)}" target="_blank" rel="noopener noreferrer">Download</a>
          </div>
        `;
        return;
      }

      const rows = (result.subjects || []).map(subject => `
        <tr>
          <td>${escapeHtml(subject.subject)}</td>
          <td>${escapeHtml(subject.marksObtained)}</td>
          <td>${escapeHtml(subject.maxMarks)}</td>
          <td>${escapeHtml(subject.grade || '')}</td>
          <td>${escapeHtml(subject.remarks || '')}</td>
        </tr>
      `).join('');

      output.innerHTML = `
        ${header}
        ${customFields}
        <div class="table-responsive mt-3">
          <table class="enterprise-table">
            <thead><tr><th>Subject</th><th>Marks</th><th>Max</th><th>Grade</th><th>Remarks</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5">No subject rows configured.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="summary-grid mt-3">
          <div class="summary-item"><span>Total</span><strong>${escapeHtml(result.totalMarks || 0)} / ${escapeHtml(result.maxMarks || 0)}</strong></div>
          <div class="summary-item"><span>Percentage</span><strong>${escapeHtml(result.percentage || 0)}%</strong></div>
          <div class="summary-item"><span>Grade</span><strong>${escapeHtml(result.grade || '')}</strong></div>
          <div class="summary-item"><span>Rank</span><strong>${escapeHtml(result.rank || '')}</strong></div>
          <div class="summary-item"><span>Remarks</span><strong>${escapeHtml(result.remarks || '')}</strong></div>
          <div class="summary-item"><span>Verification</span><strong>${escapeHtml(result.verificationCode || '')}</strong></div>
        </div>
      `;
    }
  }

  async function initGallery() {
    const grid = $('#enterpriseGalleryGrid');
    if (!grid) return;
    const chips = $('#galleryCategoryChips');
    const search = $('#enterpriseGallerySearch');
    const lightbox = $('#enterpriseLightbox');
    let activeCategory = 'all';
    let activeIndex = 0;

    try {
      state.galleryCategories = await api('/api/gallery/categories');
      state.galleryItems = await api('/api/public/gallery');
      renderChips();
      renderGrid();
    } catch (err) {
      grid.innerHTML = '<div class="notice">Gallery could not be loaded right now.</div>';
    }

    search?.addEventListener('input', renderGrid);

    function renderChips() {
      chips.innerHTML = [
        '<button class="gallery-chip is-active" data-category="all">All</button>',
        ...state.galleryCategories.map(category => `<button class="gallery-chip" data-category="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</button>`)
      ].join('');
      $all('.gallery-chip', chips).forEach(button => {
        button.addEventListener('click', () => {
          activeCategory = button.dataset.category;
          $all('.gallery-chip', chips).forEach(item => item.classList.toggle('is-active', item === button));
          renderGrid();
        });
      });
    }

    function filteredItems() {
      const query = (search?.value || '').toLowerCase();
      return state.galleryItems.filter(item => {
        const matchesCategory = activeCategory === 'all' || item.categorySlug === activeCategory;
        const haystack = `${item.title || ''} ${item.caption || ''} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
        return matchesCategory && haystack.includes(query);
      });
    }

    function renderGrid() {
      const items = filteredItems();
      if (!items.length) {
        grid.innerHTML = '<div class="notice">No gallery images match this filter.</div>';
        return;
      }
      grid.innerHTML = items.map((item, index) => `
        <article class="enterprise-gallery-item" data-index="${index}">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || item.caption || 'Sankalp gallery image')}" loading="lazy">
          <div>
            <h3>${escapeHtml(item.title || item.caption || 'Campus Moment')}</h3>
            <p>${escapeHtml(item.caption || item.description || '')}</p>
            <p>${escapeHtml(formatDate(item.eventDate))}</p>
          </div>
        </article>
      `).join('');
      $all('.enterprise-gallery-item', grid).forEach(card => {
        card.addEventListener('click', () => openLightbox(Number(card.dataset.index)));
      });
    }

    function openLightbox(index) {
      activeIndex = index;
      const item = filteredItems()[activeIndex];
      if (!item) return;
      $('#lightboxImageEnterprise').src = item.imageUrl;
      $('#lightboxTitleEnterprise').textContent = item.title || item.caption || 'Sankalp Gallery';
      $('#lightboxCaptionEnterprise').textContent = item.description || item.caption || '';
      lightbox.classList.add('is-open');
    }

    function closeLightbox() {
      lightbox.classList.remove('is-open');
    }

    function moveLightbox(direction) {
      const items = filteredItems();
      if (!items.length) return;
      activeIndex = (activeIndex + direction + items.length) % items.length;
      openLightbox(activeIndex);
    }

    $('#lightboxCloseEnterprise')?.addEventListener('click', closeLightbox);
    $('#lightboxPrevEnterprise')?.addEventListener('click', () => moveLightbox(-1));
    $('#lightboxNextEnterprise')?.addEventListener('click', () => moveLightbox(1));
    lightbox?.addEventListener('click', event => {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', event => {
      if (!lightbox?.classList.contains('is-open')) return;
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowLeft') moveLightbox(-1);
      if (event.key === 'ArrowRight') moveLightbox(1);
    });
  }

  async function initEnterpriseAdmin() {
    const root = $('#enterpriseDashboardMain');
    if (!root) return;
    try {
      const auth = await api('/api/admin/check-auth');
      if (!auth.authenticated) window.location.href = '/admin-login';
    } catch (err) {
      window.location.href = '/admin-login';
      return;
    }

    $all('[data-admin-tab]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        activateAdminTab(button.dataset.adminTab);
      });
    });

    $('#enterpriseLogout')?.addEventListener('click', async () => {
      await api('/api/admin/logout', { method: 'POST', body: JSON.stringify({}) });
      window.location.href = '/admin-login';
    });

    bindAdminForms();
    await Promise.allSettled([loadResultCategories(), loadGalleryCategories(), loadBranding()]);
    await loadOverview();
  }

  function activateAdminTab(tabId) {
    $all('[data-admin-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.adminTab === tabId));
    $all('.admin-tab').forEach(tab => tab.classList.toggle('is-active', tab.id === tabId));
    const loaders = {
      'admin-overview': loadOverview,
      'admin-result-categories': loadResultCategories,
      'admin-results': loadResultsAdmin,
      'admin-gallery-categories': loadGalleryCategories,
      'admin-gallery': loadGalleryAdmin,
      'admin-branding': loadBranding,
      'admin-students': loadStudents,
      'admin-activity': loadActivity
    };
    loaders[tabId]?.();
  }

  function bindAdminForms() {
    $('#categoryForm')?.addEventListener('submit', saveResultCategory);
    $('#resultFormEnterprise')?.addEventListener('submit', saveResultAdmin);
    $('#galleryCategoryForm')?.addEventListener('submit', saveGalleryCategory);
    $('#galleryImageForm')?.addEventListener('submit', saveGalleryImage);
    $('#brandingForm')?.addEventListener('submit', saveBranding);
    $('#importResultsForm')?.addEventListener('submit', importResults);
    $all('[data-clear-form]').forEach(button => {
      button.addEventListener('click', () => {
        const form = document.getElementById(button.dataset.clearForm);
        form?.reset();
        form?.querySelectorAll('input[type="hidden"]').forEach(input => input.value = '');
      });
    });
  }

  async function loadOverview() {
    const holder = $('#overviewStats');
    if (!holder) return;
    try {
      const data = await api('/api/admin/dashboard');
      const stats = data.stats || {};
      holder.innerHTML = [
        ['Results', stats.totalResults],
        ['Categories', stats.totalCategories],
        ['Students', stats.totalStudents],
        ['PDF Results', stats.totalPdfs],
        ['Link Results', stats.totalLinks],
        ['Gallery Images', stats.totalGalleryItems],
        ['Leads', stats.totalLeads],
        ['Inquiries', stats.totalInquiries]
      ].map(([label, value]) => `<div class="admin-card"><span>${label}</span><strong>${value || 0}</strong></div>`).join('');
    } catch (err) {
      holder.innerHTML = '<div class="notice">Dashboard stats are unavailable.</div>';
    }
  }

  async function loadResultCategories() {
    const table = $('#resultCategoriesTable');
    const selects = $all('[data-result-category-select]');
    try {
      state.resultCategories = await api('/api/admin/result-categories');
      selects.forEach(select => {
        select.innerHTML = state.resultCategories.map(category => `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</option>`).join('');
      });
      if (table) {
        table.innerHTML = state.resultCategories.map(category => `
          <tr>
            <td>${escapeHtml(category.name)}</td>
            <td>${escapeHtml(category.slug)}</td>
            <td>${escapeHtml(category.mode)}</td>
            <td>${category.active === false ? 'Inactive' : 'Active'}</td>
            <td>
              <button class="btn-subtle" data-edit-result-category="${escapeHtml(category._id || '')}">Edit</button>
              <button class="btn-subtle btn-danger-solid" data-delete-result-category="${escapeHtml(category._id || '')}">Delete</button>
            </td>
          </tr>
        `).join('') || '<tr><td colspan="5">No result categories yet.</td></tr>';
        $all('[data-edit-result-category]').forEach(button => button.addEventListener('click', () => editResultCategory(button.dataset.editResultCategory)));
        $all('[data-delete-result-category]').forEach(button => button.addEventListener('click', () => deleteResultCategory(button.dataset.deleteResultCategory)));
      }
    } catch (err) {
      if (table) table.innerHTML = '<tr><td colspan="5">Could not load categories.</td></tr>';
    }
  }

  function editResultCategory(id) {
    const category = state.resultCategories.find(item => item._id === id);
    if (!category) return;
    $('#catId').value = category._id;
    $('#catName').value = category.name || '';
    $('#catSlug').value = category.slug || '';
    $('#catMode').value = category.mode || 'dynamic';
    $('#catSort').value = category.sortOrder || 0;
    $('#catActive').checked = category.active !== false;
    $('#catFields').value = JSON.stringify(category.fields || [], null, 2);
  }

  async function saveResultCategory(event) {
    event.preventDefault();
    const id = $('#catId').value;
    const payload = {
      name: $('#catName').value.trim(),
      slug: $('#catSlug').value.trim(),
      mode: $('#catMode').value,
      sortOrder: Number($('#catSort').value || 0),
      active: $('#catActive').checked,
      fields: []
    };
    try {
      payload.fields = $('#catFields').value.trim() ? JSON.parse($('#catFields').value) : [];
      await api(id ? `/api/admin/result-categories/${id}` : '/api/admin/result-categories', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      event.target.reset();
      $('#catId').value = '';
      toast('Result category saved.');
      await loadResultCategories();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function deleteResultCategory(id) {
    if (!id || !confirm('Delete this result category?')) return;
    await api(`/api/admin/result-categories/${id}`, { method: 'DELETE', body: JSON.stringify({}) });
    await loadResultCategories();
  }

  async function loadResultsAdmin() {
    const table = $('#resultsEnterpriseTable');
    if (!table) return;
    try {
      state.adminResults = await api('/api/admin/results');
      table.innerHTML = state.adminResults.map(result => `
        <tr>
          <td>${escapeHtml(result.registrationNumber)}</td>
          <td>${escapeHtml(result.studentName)}</td>
          <td>${escapeHtml(result.categorySlug)}</td>
          <td>${escapeHtml(result.resultMode)}</td>
          <td>${result.published ? 'Published' : 'Draft'}</td>
          <td>
            <button class="btn-subtle" data-edit-result="${escapeHtml(result._id)}">Edit</button>
            <button class="btn-subtle btn-danger-solid" data-delete-result="${escapeHtml(result._id)}">Delete</button>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="6">No results yet.</td></tr>';
      $all('[data-edit-result]').forEach(button => button.addEventListener('click', () => editResultAdmin(button.dataset.editResult)));
      $all('[data-delete-result]').forEach(button => button.addEventListener('click', () => deleteResultAdmin(button.dataset.deleteResult)));
    } catch (err) {
      table.innerHTML = '<tr><td colspan="6">Could not load results.</td></tr>';
    }
  }

  function editResultAdmin(id) {
    const result = state.adminResults.find(item => item._id === id);
    if (!result) return;
    $('#adminResultId').value = result._id;
    $('#resCategory').value = result.categorySlug || '';
    $('#resMode').value = result.resultMode || 'dynamic';
    $('#resReg').value = result.registrationNumber || '';
    $('#resRoll').value = result.rollNumber || '';
    $('#resName').value = result.studentName || '';
    $('#resFather').value = result.fatherName || '';
    $('#resMother').value = result.motherName || '';
    $('#resDob').value = result.dob ? new Date(result.dob).toISOString().split('T')[0] : '';
    $('#resClass').value = result.className || '';
    $('#resSession').value = result.session || '';
    $('#resSchool').value = result.schoolName || '';
    $('#resPhoto').value = result.photoUrl || '';
    $('#resSubjects').value = (result.subjects || []).map(row => `${row.subject}|${row.marksObtained}|${row.maxMarks}|${row.grade || ''}|${row.remarks || ''}`).join('\n');
    $('#resTotal').value = result.totalMarks || 0;
    $('#resMax').value = result.maxMarks || 0;
    $('#resPercentage').value = result.percentage || 0;
    $('#resGrade').value = result.grade || '';
    $('#resRank').value = result.rank || '';
    $('#resRemarks').value = result.remarks || '';
    $('#resPdfUrl').value = result.pdfUrl || '';
    $('#resExternalUrl').value = result.externalUrl || '';
    $('#resPublished').checked = !!result.published;
    window.scrollTo({ top: $('#resultFormEnterprise').offsetTop - 40, behavior: 'smooth' });
  }

  async function saveResultAdmin(event) {
    event.preventDefault();
    const id = $('#adminResultId').value;
    const form = new FormData();
    const fields = {
      categorySlug: $('#resCategory').value,
      resultMode: $('#resMode').value,
      registrationNumber: $('#resReg').value.trim(),
      rollNumber: $('#resRoll').value.trim(),
      studentName: $('#resName').value.trim(),
      fatherName: $('#resFather').value.trim(),
      motherName: $('#resMother').value.trim(),
      dob: $('#resDob').value,
      className: $('#resClass').value,
      session: $('#resSession').value,
      schoolName: $('#resSchool').value,
      photoUrl: $('#resPhoto').value,
      subjects: JSON.stringify(parseSubjectsInput($('#resSubjects').value)),
      totalMarks: $('#resTotal').value,
      maxMarks: $('#resMax').value,
      percentage: $('#resPercentage').value,
      grade: $('#resGrade').value,
      rank: $('#resRank').value,
      remarks: $('#resRemarks').value,
      pdfUrl: $('#resPdfUrl').value,
      externalUrl: $('#resExternalUrl').value,
      published: $('#resPublished').checked
    };
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));
    const file = $('#resFile').files[0];
    if (file) form.append('marksheet', file);
    try {
      await api(id ? `/api/admin/results/${id}` : '/api/admin/results', {
        method: id ? 'PUT' : 'POST',
        body: form
      });
      event.target.reset();
      $('#adminResultId').value = '';
      toast('Result saved.');
      await loadResultsAdmin();
      await loadOverview();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function deleteResultAdmin(id) {
    if (!confirm('Delete this result?')) return;
    await api(`/api/admin/results/${id}`, { method: 'DELETE', body: JSON.stringify({}) });
    await loadResultsAdmin();
  }

  async function importResults(event) {
    event.preventDefault();
    const file = $('#resultImportFile').files[0];
    if (!file) return toast('Choose a CSV file first.', true);
    const form = new FormData();
    form.append('file', file);
    form.append('categorySlug', $('#resultImportCategory').value);
    form.append('published', $('#resultImportPublished').checked);
    try {
      const data = await api('/api/admin/results/import', { method: 'POST', body: form });
      $('#importReport').textContent = `Imported ${data.report.imported} of ${data.report.total}. Failed: ${data.report.failed}.`;
      await loadResultsAdmin();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function loadGalleryCategories() {
    const table = $('#galleryCategoriesTable');
    const selects = $all('[data-gallery-category-select]');
    try {
      state.galleryCategories = await api('/api/admin/gallery-categories');
      selects.forEach(select => {
        select.innerHTML = state.galleryCategories.map(category => `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</option>`).join('');
      });
      if (table) {
        table.innerHTML = state.galleryCategories.map(category => `
          <tr>
            <td>${escapeHtml(category.name)}</td>
            <td>${escapeHtml(category.slug)}</td>
            <td>${category.active === false ? 'Inactive' : 'Active'}</td>
            <td>
              <button class="btn-subtle" data-edit-gallery-category="${escapeHtml(category._id || '')}">Edit</button>
              <button class="btn-subtle btn-danger-solid" data-delete-gallery-category="${escapeHtml(category._id || '')}">Delete</button>
            </td>
          </tr>
        `).join('') || '<tr><td colspan="4">No gallery categories yet.</td></tr>';
        $all('[data-edit-gallery-category]').forEach(button => button.addEventListener('click', () => editGalleryCategory(button.dataset.editGalleryCategory)));
        $all('[data-delete-gallery-category]').forEach(button => button.addEventListener('click', () => deleteGalleryCategory(button.dataset.deleteGalleryCategory)));
      }
    } catch (err) {
      if (table) table.innerHTML = '<tr><td colspan="4">Could not load gallery categories.</td></tr>';
    }
  }

  function editGalleryCategory(id) {
    const category = state.galleryCategories.find(item => item._id === id);
    if (!category) return;
    $('#galleryCatId').value = category._id;
    $('#galleryCatName').value = category.name || '';
    $('#galleryCatSlug').value = category.slug || '';
    $('#galleryCatSort').value = category.sortOrder || 0;
    $('#galleryCatActive').checked = category.active !== false;
  }

  async function saveGalleryCategory(event) {
    event.preventDefault();
    const id = $('#galleryCatId').value;
    const payload = {
      name: $('#galleryCatName').value.trim(),
      slug: $('#galleryCatSlug').value.trim(),
      sortOrder: Number($('#galleryCatSort').value || 0),
      active: $('#galleryCatActive').checked
    };
    try {
      await api(id ? `/api/admin/gallery-categories/${id}` : '/api/admin/gallery-categories', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      event.target.reset();
      $('#galleryCatId').value = '';
      toast('Gallery category saved.');
      await loadGalleryCategories();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function deleteGalleryCategory(id) {
    if (!id || !confirm('Delete this gallery category?')) return;
    await api(`/api/admin/gallery-categories/${id}`, { method: 'DELETE', body: JSON.stringify({}) });
    await loadGalleryCategories();
  }

  async function loadGalleryAdmin() {
    const table = $('#galleryEnterpriseTable');
    if (!table) return;
    try {
      state.adminGallery = await api('/api/admin/gallery');
      table.innerHTML = state.adminGallery.map(item => `
        <tr>
          <td><img src="${escapeHtml(item.imageUrl)}" alt="" width="72" height="48" style="object-fit:cover;border-radius:6px;"></td>
          <td>${escapeHtml(item.title || item.caption)}</td>
          <td>${escapeHtml(item.categorySlug)}</td>
          <td>${item.featured ? 'Featured' : ''}</td>
          <td><button class="btn-subtle btn-danger-solid" data-delete-gallery="${escapeHtml(item._id)}">Delete</button></td>
        </tr>
      `).join('') || '<tr><td colspan="5">No gallery images yet.</td></tr>';
      $all('[data-delete-gallery]').forEach(button => button.addEventListener('click', () => deleteGalleryImage(button.dataset.deleteGallery)));
    } catch (err) {
      table.innerHTML = '<tr><td colspan="5">Could not load gallery images.</td></tr>';
    }
  }

  async function saveGalleryImage(event) {
    event.preventDefault();
    const file = $('#galleryImageFile').files[0];
    if (!file) return toast('Choose an image first.', true);
    const form = new FormData();
    form.append('image', file);
    form.append('categorySlug', $('#galleryImageCategory').value);
    form.append('title', $('#galleryImageTitle').value);
    form.append('caption', $('#galleryImageCaption').value);
    form.append('description', $('#galleryImageDescription').value);
    form.append('eventDate', $('#galleryImageDate').value);
    form.append('eventLocation', $('#galleryImageLocation').value);
    form.append('tags', $('#galleryImageTags').value);
    form.append('featured', $('#galleryImageFeatured').checked);
    try {
      await api('/api/admin/gallery', { method: 'POST', body: form });
      event.target.reset();
      toast('Gallery image uploaded.');
      await loadGalleryAdmin();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function deleteGalleryImage(id) {
    if (!confirm('Delete this image?')) return;
    await api(`/api/admin/gallery/${id}`, { method: 'DELETE', body: JSON.stringify({}) });
    await loadGalleryAdmin();
  }

  async function loadBranding() {
    const form = $('#brandingForm');
    if (!form) return;
    try {
      const branding = await api('/api/admin/settings/branding');
      $('#brandLogoUrl').value = branding.logoUrl || '';
      $('#brandFaviconUrl').value = branding.faviconUrl || '';
      $('#brandInstituteName').value = branding.instituteName || '';
      $('#brandPrimaryColor').value = branding.primaryColor || '#00acee';
      $('#brandPreviewLogo').src = branding.logoUrl || '';
    } catch (err) {
      $('#brandingStatus').textContent = 'Branding settings are unavailable in demo mode.';
    }
  }

  async function saveBranding(event) {
    event.preventDefault();
    try {
      const logoFile = $('#brandLogoFile').files[0];
      const faviconFile = $('#brandFaviconFile').files[0];
      const payload = {
        logoUrl: $('#brandLogoUrl').value,
        faviconUrl: $('#brandFaviconUrl').value,
        instituteName: $('#brandInstituteName').value,
        primaryColor: $('#brandPrimaryColor').value
      };
      if (logoFile) payload.logoUrl = await uploadBrandingFile(logoFile, 'logo');
      if (faviconFile) payload.faviconUrl = await uploadBrandingFile(faviconFile, 'favicon');
      await api('/api/admin/settings/branding', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Branding updated.');
      await loadBranding();
      await applyBranding();
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function uploadBrandingFile(file, type) {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);
    const data = await api('/api/admin/settings/branding/upload', { method: 'POST', body: form });
    return data.url;
  }

  async function loadStudents() {
    const table = $('#studentsEnterpriseTable');
    if (!table) return;
    try {
      const students = await api('/api/admin/students');
      table.innerHTML = students.map(student => `
        <tr>
          <td>${escapeHtml(student.registrationNumber)}</td>
          <td>${escapeHtml(student.studentName)}</td>
          <td>${escapeHtml(student.className || '')}</td>
          <td>${escapeHtml(student.session || '')}</td>
          <td>${escapeHtml(student.mobileNumber || '')}</td>
        </tr>
      `).join('') || '<tr><td colspan="5">Student records appear after result imports.</td></tr>';
    } catch (err) {
      table.innerHTML = '<tr><td colspan="5">Could not load students.</td></tr>';
    }
  }

  async function loadActivity() {
    const table = $('#activityEnterpriseTable');
    if (!table) return;
    try {
      const logs = await api('/api/admin/activity-logs');
      table.innerHTML = logs.map(log => `
        <tr>
          <td>${escapeHtml(formatDate(log.createdAt))}</td>
          <td>${escapeHtml(log.actor || '')}</td>
          <td>${escapeHtml(log.action || '')}</td>
          <td>${escapeHtml(log.entityType || '')}</td>
        </tr>
      `).join('') || '<tr><td colspan="4">No activity logs yet.</td></tr>';
    } catch (err) {
      table.innerHTML = '<tr><td colspan="4">Could not load activity.</td></tr>';
    }
  }

  function initHomeEnhancements() {
    const section = $('.academic-foundation-upgrade');
    if (!section) return;
    window.addEventListener('scroll', () => {
      const rect = section.getBoundingClientRect();
      const offset = Math.max(-40, Math.min(40, rect.top * -0.04));
      section.style.setProperty('--foundation-parallax', `${offset}px`);
    }, { passive: true });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    applyBranding();
    initHomeEnhancements();
    initResultPortal();
    initGallery();
    initEnterpriseAdmin();
  });
})();
