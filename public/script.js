let allPapers = [];
let currentPage = 1;
let searchTerm = '';
let yearFilter = '';
let selectedKeywords = [];
let allKeywordsList = [];
const itemsPerPage = 4;

async function loadPapers() {
    try {
        showLoading();
        
        const response = await fetch('/papers-data');
        allPapers = await response.json();
        document.getElementById('statsCount').innerHTML = `📚 ${allPapers.length} Papers Indexed`;
        extractKeywords();
        populateFilters();
        render();
        
        hideLoading();
    } catch (error) {
        console.error('Error:', error);
        hideLoading();
        showError();
    }
}

// ==================== LOADING ANIMATION FUNCTIONS ====================
function showLoading() {
    const grid = document.getElementById('papersGrid');
    if (grid) {
        grid.innerHTML = `
            <div class="loading-container">
                <div class="loading-animation">
                    <div class="academic-spinner">
                        <div class="circle"></div>
                        <div class="circle"></div>
                        <div class="circle"></div>
                    </div>
                    <div class="loading-title">
                        Loading Research Papers
                        <span class="pulse-dot"></span>
                    </div>
                    <div class="loading-subtitle">
                        Retrieving data from IEEE Xplore
                    </div>
                    <div class="progress-wrapper">
                        <div class="progress-bar">
                            <div class="progress-fill"></div>
                        </div>
                    </div>
                    <div class="loading-steps">
                        <div class="step active" id="step1">
                            <i class="fas fa-circle"></i> Connecting
                        </div>
                        <div class="step" id="step2">
                            <i class="far fa-circle"></i> Fetching
                        </div>
                        <div class="step" id="step3">
                            <i class="far fa-circle"></i> Ready
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        let step = 1;
        const stepInterval = setInterval(() => {
            step++;
            const stepElem = document.getElementById(`step${step-1}`);
            if (stepElem) {
                stepElem.classList.remove('active');
                stepElem.classList.add('completed');
                stepElem.innerHTML = stepElem.innerHTML.replace('fa-circle', 'fa-check-circle');
            }
            const nextStep = document.getElementById(`step${step}`);
            if (nextStep) {
                nextStep.classList.add('active');
                nextStep.innerHTML = nextStep.innerHTML.replace('fa-circle', 'fa-circle');
            }
            if (step >= 3) clearInterval(stepInterval);
        }, 800);
    }
}

function hideLoading() {
    // Loading will be replaced by render() content
}

function showError() {
    const grid = document.getElementById('papersGrid');
    if (grid) {
        grid.innerHTML = `
            <div class="error-container">
                <div class="error-content">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Failed to load papers</h3>
                    <p>Please check your connection and try again.</p>
                    <button onclick="location.reload()">Retry</button>
                </div>
            </div>
        `;
    }
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function extractKeywords() {
    const keywordsSet = new Set();
    allPapers.forEach(paper => {
        if (paper.keywords) {
            let kwArray = paper.keywords.split(/[,;]/);
            kwArray.forEach(kw => {
                let trimmed = kw.trim();
                if (trimmed && trimmed !== 'Research Paper' && trimmed !== 'N/A' && trimmed.length > 2) {
                    trimmed = trimmed.replace(/\.$/, '');
                    trimmed = capitalizeFirst(trimmed);
                    keywordsSet.add(trimmed);
                }
            });
        }
    });
    allKeywordsList = Array.from(keywordsSet).sort();
}

function populateFilters() {
    const years = [...new Set(allPapers.map(p => p.year).filter(y => y !== 'Unknown'))];
    years.sort((a, b) => parseInt(b) - parseInt(a));
    const yearSelect = document.getElementById('yearFilter');
    yearSelect.innerHTML = '<option value="">All Years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    
    const keywordListDiv = document.getElementById('keywordList');
    keywordListDiv.innerHTML = allKeywordsList.map(kw => `
        <label>
            <input type="checkbox" value="${escapeHtml(kw)}" class="keyword-checkbox">
            ${escapeHtml(kw)}
        </label>
    `).join('');
}

function updateSelectedKeywordsDisplay() {
    const container = document.getElementById('selectedKeywords');
    if (selectedKeywords.length === 0) {
        container.innerHTML = '<div style="font-size:0.75rem; color:var(--text-secondary);">No keywords selected</div>';
        return;
    }
    container.innerHTML = selectedKeywords.map(kw => `
        <span class="selected-keyword-tag">
            ${escapeHtml(kw)} <span onclick="removeKeyword('${escapeHtml(kw)}')">&times;</span>
        </span>
    `).join('');
}

function removeKeyword(keyword) {
    selectedKeywords = selectedKeywords.filter(k => k !== keyword);
    updateSelectedKeywordsDisplay();
    document.querySelectorAll('.keyword-checkbox').forEach(cb => {
        if (cb.value === keyword) cb.checked = false;
    });
    currentPage = 1;
    render();
}

function applyKeywordFilter() {
    selectedKeywords = [];
    document.querySelectorAll('.keyword-checkbox:checked').forEach(cb => {
        selectedKeywords.push(cb.value);
    });
    updateSelectedKeywordsDisplay();
    document.getElementById('multiSelectDropdown').classList.remove('active');
    currentPage = 1;
    render();
}

function filterPapers() {
    return allPapers.filter(paper => {
        if (searchTerm && !paper.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
            !paper.authors.toLowerCase().includes(searchTerm.toLowerCase()) &&
            !paper.abstract.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        
        if (yearFilter && paper.year !== yearFilter) return false;
        
        if (selectedKeywords.length > 0) {
            const paperKeywordsArray = paper.keywords.toLowerCase().split(/[,;]/).map(kw => kw.trim());
            const hasMatchingKeyword = selectedKeywords.some(selectedKw => {
                const selectedLower = selectedKw.toLowerCase();
                return paperKeywordsArray.some(paperKw => {
                    return paperKw.includes(selectedLower) || selectedLower.includes(paperKw);
                });
            });
            if (!hasMatchingKeyword) return false;
        }
        
        return true;
    });
}

function render() {
    const filtered = filterPapers();
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage;
    const paginatedPapers = filtered.slice(start, start + itemsPerPage);
    
    document.getElementById('activeFilters').innerHTML = (searchTerm || yearFilter || selectedKeywords.length > 0) ? `
        <span><i class="fas fa-filter"></i> Active filters:</span>
        ${searchTerm ? `<span class="filter-tag">🔍 ${escapeHtml(searchTerm)} <a href="#" onclick="clearSearch()">&times;</a></span>` : ''}
        ${yearFilter ? `<span class="filter-tag">📅 ${escapeHtml(yearFilter)} <a href="#" onclick="clearYear()">&times;</a></span>` : ''}
        ${selectedKeywords.map(kw => `<span class="filter-tag">🏷️ ${escapeHtml(kw)} <a href="#" onclick="removeKeyword('${escapeHtml(kw)}')">&times;</a></span>`).join('')}
        <span class="results-count"><i class="fas fa-chart-line"></i> ${filtered.length} results</span>
    ` : '';
    
    const grid = document.getElementById('papersGrid');
    
    // EMPTY STATE - Centered (only this is changed)
    if (paginatedPapers.length === 0) {
        grid.innerHTML = `
            <div class="empty-state-wrapper">
                <div class="empty-state-card">
                    <div class="empty-state-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h3>No papers found</h3>
                    <p>We couldn't find any papers matching your criteria.</p>
                    <div class="empty-state-suggestions">
                        <span>Try:</span>
                        <button onclick="clearSearch()">Clearing search</button>
                        <button onclick="clearYear()">Changing year filter</button>
                        <button onclick="document.getElementById('clearFilters').click()">Removing all filters</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    
    // ORIGINAL CARD GRID - Exactly as before, no changes
    grid.innerHTML = paginatedPapers.map((paper, idx) => `
        <div class="card" data-index="${idx}" 
             data-pdf="${escapeHtml(paper.file_path)}" 
             data-title="${escapeHtml(paper.title)}" 
             data-authors="${escapeHtml(paper.authors)}" 
             data-year="${escapeHtml(paper.year)}" 
             data-keywords="${escapeHtml(paper.keywords)}" 
             data-abstract="${escapeHtml(paper.abstract)}">
            <div class="card-header">
                <div class="card-title">${escapeHtml(paper.title)}</div>
                <div class="card-meta">
                    <div class="authors"><i class="fas fa-user-edit"></i> ${escapeHtml(truncate(paper.authors, 60))}</div>
                    <div class="year-badge"><i class="far fa-calendar-alt"></i> ${escapeHtml(paper.year)}</div>
                </div>
            </div>
            <div class="card-body">
                <div class="keywords">
                    ${paper.keywords.split(/[,;]/).slice(0,5).map(kw => `<span class="keyword-tag"># ${escapeHtml(kw.trim())}</span>`).join('')}
                </div>
                <div class="abstract">${escapeHtml(truncatePaper(paper.abstract, 200))}...</div>
            </div>
            <div class="card-footer">
                <button class="btn btn-primary preview-btn" data-pdf="${escapeHtml(paper.file_path)}" data-title="${escapeHtml(paper.title)}"><i class="fas fa-eye"></i> Preview PDF</button>
                <a href="${escapeHtml(paper.file_path)}" download class="btn btn-outline"><i class="fas fa-download"></i> Download PDF</a>
            </div>
        </div>
    `).join('');
    
    // Pagination
    let paginationHtml = '';
    if (currentPage > 1) paginationHtml += `<a onclick="changePage(${currentPage - 1})"><i class="fas fa-chevron-left"></i> Previous</a>`;
    for (let i = 1; i <= Math.min(totalPages, 5); i++) {
        paginationHtml += `<a onclick="changePage(${i})" class="${i === currentPage ? 'active' : ''}">${i}</a>`;
    }
    if (currentPage < totalPages) paginationHtml += `<a onclick="changePage(${currentPage + 1})">Next <i class="fas fa-chevron-right"></i></a>`;
    document.getElementById('pagination').innerHTML = paginationHtml;
    
    // Attach preview listeners
    document.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPdfModal(btn.getAttribute('data-pdf'), btn.getAttribute('data-title'));
        });
    });
    
    // Card click for big card
    document.querySelectorAll('.card').forEach(card => {
        card.removeEventListener('click', handleCardClick);
        card.addEventListener('click', handleCardClick);
    });
}

function handleCardClick(e) {
    if (e.target.closest('.card-footer')) return;
    const paper = {
        file_path: this.getAttribute('data-pdf'),
        title: this.getAttribute('data-title'),
        authors: this.getAttribute('data-authors'),
        year: this.getAttribute('data-year'),
        keywords: this.getAttribute('data-keywords'),
        abstract: this.getAttribute('data-abstract')
    };
    openBigCard(paper);
}

let currentBigIndex = 0;
let bigCardPapers = [];

function openBigCard(paper) {
    bigCardPapers = filterPapers();
    currentBigIndex = bigCardPapers.findIndex(p => p.file_path === paper.file_path);
    renderBigCard(currentBigIndex);
    document.getElementById('bigcardModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        const bigCard = document.querySelector('.big-card');
        const scrollBtn = document.getElementById('scrollToTopBtn');
        if (bigCard) {
            bigCard.scrollTop = 0;
            if (scrollBtn) scrollBtn.classList.remove('visible');
            const handleBigCardScroll = function() {
                if (bigCard.scrollTop > 200) {
                    scrollBtn.classList.add('visible');
                } else {
                    scrollBtn.classList.remove('visible');
                }
            };
            bigCard.addEventListener('scroll', handleBigCardScroll);
            bigCard._scrollHandler = handleBigCardScroll;
        }
    }, 150);
}

function renderBigCard(index) {
    if (!bigCardPapers.length) return;
    if (index < 0) index = 0;
    if (index >= bigCardPapers.length) index = bigCardPapers.length - 1;
    currentBigIndex = index;
    const paper = bigCardPapers[currentBigIndex];
    
    const keywordsArray = paper.keywords ? paper.keywords.split(/[,;]/).map(k => k.trim()) : [];
    const keywordsHtml = keywordsArray.map(kw => 
        `<span class="big-keyword"># ${escapeHtml(kw)}</span>`
    ).join('');
    
    const html = `
        <div class="big-card-title">${escapeHtml(paper.title)}</div>
        <div class="big-card-meta">
            <div class="big-authors"><i class="fas fa-users"></i> ${escapeHtml(paper.authors)}</div>
            <div class="big-year"><i class="far fa-calendar-alt"></i> ${escapeHtml(paper.year)}</div>
        </div>
        <div class="big-keywords">${keywordsHtml || '<span class="big-keyword"># Research Paper</span>'}</div>
        <div class="big-abstract-full">
            <h4><i class="fas fa-file-alt"></i> Abstract</h4>
            <p>${escapeHtml(paper.abstract)}</p>
        </div>
        <div class="big-actions">
            <button onclick="openPdfModalFromBigCard('${escapeHtml(paper.file_path)}', '${escapeHtml(paper.title)}')" class="btn btn-primary"><i class="fas fa-eye"></i> Preview PDF</button>
            <a href="${escapeHtml(paper.file_path)}" download class="btn btn-outline"><i class="fas fa-download"></i> Download PDF</a>
        </div>
    `;
    document.getElementById('bigCardDynamicContent').innerHTML = html;
    updateBigArrowsState();
}

function openPdfModalFromBigCard(pdfUrl, title) {
    document.getElementById('bigcardModal').classList.remove('active');
    setTimeout(() => {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('pdfFrame').src = pdfUrl;
        document.getElementById('pdfModal').classList.add('active');
        document.body.style.overflow = 'hidden';
    }, 200);
}

function updateBigArrowsState() {
    const prevBtn = document.getElementById('bigPrevBtn');
    const nextBtn = document.getElementById('bigNextBtn');
    if (currentBigIndex <= 0) prevBtn.classList.add('disabled');
    else prevBtn.classList.remove('disabled');
    if (currentBigIndex >= bigCardPapers.length - 1) nextBtn.classList.add('disabled');
    else nextBtn.classList.remove('disabled');
}

function prevBigCard() { 
    if (currentBigIndex > 0) {
        renderBigCard(currentBigIndex - 1);
        setTimeout(() => {
            const bigCard = document.querySelector('.big-card');
            if (bigCard) bigCard.scrollTop = 0;
            const scrollBtn = document.getElementById('scrollToTopBtn');
            if (scrollBtn) scrollBtn.classList.remove('visible');
        }, 50);
    }
}

function nextBigCard() { 
    if (currentBigIndex < bigCardPapers.length - 1) {
        renderBigCard(currentBigIndex + 1);
        setTimeout(() => {
            const bigCard = document.querySelector('.big-card');
            if (bigCard) bigCard.scrollTop = 0;
            const scrollBtn = document.getElementById('scrollToTopBtn');
            if (scrollBtn) scrollBtn.classList.remove('visible');
        }, 50);
    }
}

function closeBigCard() { 
    document.getElementById('bigcardModal').classList.remove('active'); 
    document.body.style.overflow = ''; 
}

function openPdfModal(pdfUrl, title) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('pdfFrame').src = pdfUrl;
    document.getElementById('pdfModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePdfModal() {
    document.getElementById('pdfModal').classList.remove('active');
    document.getElementById('pdfFrame').src = '';
    document.body.style.overflow = '';
}

function changePage(page) { 
    currentPage = page; 
    render(); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
}

function clearSearch() { 
    searchTerm = ''; 
    document.getElementById('searchInput').value = ''; 
    currentPage = 1; 
    render(); 
}

function clearYear() { 
    yearFilter = ''; 
    document.getElementById('yearFilter').value = ''; 
    currentPage = 1; 
    render(); 
}

function truncate(str, len) { 
    if (!str) return ''; 
    return str.length > len ? str.substring(0, len) + '...' : str; 
}

function truncatePaper(str, len) { 
    if (!str) return ''; 
    return str.length > len ? str.substring(0, len) : str; 
}

function escapeHtml(str) { 
    if (!str) return ''; 
    return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); 
}

function scrollToTopBigCard() {
    const bigCard = document.querySelector('.big-card');
    if (bigCard) {
        bigCard.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ==================== EVENT LISTENERS ====================

document.getElementById('searchInput').addEventListener('input', (e) => { 
    searchTerm = e.target.value; 
    currentPage = 1; 
    render(); 
});

document.getElementById('yearFilter').addEventListener('change', (e) => { 
    yearFilter = e.target.value; 
    currentPage = 1; 
    render(); 
});

document.getElementById('clearFilters').addEventListener('click', () => { 
    searchTerm = ''; 
    yearFilter = ''; 
    selectedKeywords = []; 
    document.getElementById('searchInput').value = ''; 
    document.getElementById('yearFilter').value = ''; 
    updateSelectedKeywordsDisplay(); 
    document.querySelectorAll('.keyword-checkbox').forEach(cb => cb.checked = false); 
    currentPage = 1; 
    render(); 
});

document.getElementById('closeModal').addEventListener('click', closePdfModal);
document.getElementById('pdfModal').addEventListener('click', (e) => { 
    if (e.target === document.getElementById('pdfModal')) closePdfModal(); 
});

document.getElementById('closeBigCardBtn').addEventListener('click', closeBigCard);
document.getElementById('bigPrevBtn').addEventListener('click', prevBigCard);
document.getElementById('bigNextBtn').addEventListener('click', nextBigCard);
document.getElementById('bigcardModal').addEventListener('click', (e) => { 
    if (e.target === document.getElementById('bigcardModal')) closeBigCard(); 
});

document.getElementById('scrollToTopBtn').addEventListener('click', scrollToTopBigCard);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { 
        closePdfModal(); 
        closeBigCard(); 
    }
    if (document.getElementById('bigcardModal').classList.contains('active')) {
        if (e.key === 'ArrowLeft') { 
            e.preventDefault(); 
            prevBigCard(); 
        }
        if (e.key === 'ArrowRight') { 
            e.preventDefault(); 
            nextBigCard(); 
        }
    }
});

const multiBtn = document.getElementById('multiSelectBtn');
const multiDropdown = document.getElementById('multiSelectDropdown');
if (multiBtn && multiDropdown) {
    multiBtn.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        multiDropdown.classList.toggle('active'); 
    });
    document.addEventListener('click', (e) => { 
        if (!multiBtn.contains(e.target) && !multiDropdown.contains(e.target)) {
            multiDropdown.classList.remove('active'); 
        }
    });
}

document.getElementById('applyKeywords')?.addEventListener('click', applyKeywordFilter);

const themeToggle = document.getElementById('themeToggle');
if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

function initMainPageScrollButton() {
    const scrollBtn = document.getElementById('scrollToTopBtn');
    if (!scrollBtn) return;
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    });
    
    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function init() {
    loadPapers();
    initMainPageScrollButton();
}

init();