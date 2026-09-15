import HTMLFlipBook from 'react-pageflip';
import { BookOpen, Download, FileText, Maximize2, Minimize2 } from 'lucide-react';
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import { type BookDocument, getOcrJobDocumentUrl, getSegmentJobDocumentUrl } from '../api/ocrJobs';
import { transliterateBosancicaToLatin } from '../bosancica';
import Button from './ui/Button';
import coverArtwork from '../assets/digitalna-knjiga-stecak-cover.png';

type Props = { books: BookDocument[]; loading: boolean };
const BookPage = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function BookPage({ className = '', ...props }, ref) {
  return <div ref={ref} className={`book-page ${className}`.trim()} {...props} />;
});

const paragraphs = (job: BookDocument) => {
  const normalization = job.ocr_job?.normalization;
  return normalization?.paragraphs?.length
    ? normalization.paragraphs
    : (normalization?.modern_bosnian ?? '').split(/\n{2,}/).filter(Boolean);
};

const modernLatinica = (job: BookDocument) => {
  const lines = job.ocr_job?.output_lines ?? [];
  const source = lines.length
    ? lines.map((line) => typeof line === 'string' ? line : line.text ?? '').join(' ')
    : job.ocr_job?.output_text ?? '';
  return transliterateBosancicaToLatin(source);
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));

const downloadBlob = (contents: string, type: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const imageToDataUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to include image in export (${response.status}).`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image for export.'));
    reader.readAsDataURL(blob);
  });
};

export default function BookWorkspace({ books, loading }: Props) {
  const readerRef = useRef<HTMLDivElement>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [readingMode, setReadingMode] = useState(false);
  const [viewMode, setViewMode] = useState<'book' | 'pdf'>('book');
  const [pageSize, setPageSize] = useState({ width: 500, height: 650 });
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;

    const fitBook = () => {
      const { width, height, top } = reader.getBoundingClientRect();
      if (readingMode) {
        const pageWidth = Math.max(280, Math.floor(width / 2));
        const pageHeight = Math.max(390, Math.floor(height));
        setPageSize((current) => current.width === pageWidth && current.height === pageHeight
          ? current
          : { width: pageWidth, height: pageHeight });
        return;
      }

      const availableWidth = Math.max(280, width - 24);
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const availableHeight = Math.max(390, Math.min(height - 16, viewportHeight - top - 16));
      const pageHeight = Math.floor(Math.min(availableHeight, availableWidth / (2 * (500 / 650))));
      const pageWidth = Math.floor(pageHeight * (500 / 650));
      setPageSize((current) => current.width === pageWidth && current.height === pageHeight
        ? current
        : { width: pageWidth, height: pageHeight });
    };

    fitBook();
    const observer = new ResizeObserver(fitBook);
    observer.observe(reader);
    window.visualViewport?.addEventListener('resize', fitBook);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', fitBook);
    };
  }, [readingMode]);

  useEffect(() => {
    const syncFullscreen = () => setReadingMode(document.fullscreenElement === readerRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) setExportMenuOpen(false);
    };
    if (exportMenuOpen) document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [exportMenuOpen]);

  const toggleReadingMode = async () => {
    if (readingMode || document.fullscreenElement) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setReadingMode(false);
      return;
    }
    setReadingMode(true);
    try {
      await readerRef.current?.requestFullscreen();
    } catch {
      // The fixed reader overlay remains a usable fullscreen fallback when
      // the browser rejects the Fullscreen API.
    }
  };

  const documentUrl = (job: BookDocument) => job.book_source === 'ocr'
    ? getOcrJobDocumentUrl(job.id)
    : getSegmentJobDocumentUrl(job.id);

  const exportHtml = async () => {
    const [frontCover, ...documentImages] = await Promise.all([
      imageToDataUrl(coverArtwork),
      ...books.map((job) => imageToDataUrl(documentUrl(job))),
    ]);
    const cover = (className: string, contents = '') => `<article class="cover ${className}"><img src="${frontCover}" alt="" />${contents}</article>`;
    const frontCoverContents = '<div class="cover-veil"></div><div class="cover-content"><div><strong>◇</strong><p>Digitalna baština Bosne i Hercegovine</p></div><div class="cover-title"><h2>Digitalna<br>knjiga</h2><i></i><p>Čuvamo rukopise.<br>Otkrivamo naslijeđe.</p></div></div><b>Bosančica</b>';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Digitalna knjiga</title><style>@page{margin:14mm}body{max-width:800px;margin:40px auto;font:16px/1.55 Georgia,serif;color:#302317}h1{font-size:32px;text-align:center}article{break-after:page;margin:0 0 48px}h2{font-size:22px;margin-top:28px}h3{font:600 12px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#806033}.document-image{display:block;width:100%;max-height:560px;object-fit:contain;background:#dfd0b4}.cover{position:relative;aspect-ratio:500/650;overflow:hidden;color:#fff2c9;background:#2d2114;box-shadow:0 8px 22px rgba(62,43,20,.25);isolation:isolate}.cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.cover-veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,12,6,.2),rgba(23,14,5,.06) 42%,rgba(15,10,5,.35))}.cover-content{position:relative;z-index:1;display:flex;height:100%;box-sizing:border-box;align-items:center;flex-direction:column;padding:38px 30px 34px;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.76)}.cover-content>div:first-child{display:flex;align-items:center;flex-direction:column}.cover-content strong{margin-bottom:16px;color:#e8c477;font-size:38px;font-weight:400}.cover p{margin:0}.cover-content>div:first-child p{color:#e9bf69;font-size:10px;font-variant:small-caps;letter-spacing:.16em;text-transform:uppercase}.cover-title{display:flex;align-items:center;flex-direction:column;margin-top:22px}.cover-title h2{margin:8px 0 14px;color:#fff1c8;font-size:clamp(39px,6vw,56px);font-weight:400;line-height:.95;letter-spacing:.025em;text-transform:uppercase}.cover-title i{width:92px;height:1px;margin:4px 0 17px;background:linear-gradient(90deg,transparent,#e9bf69,transparent)}.cover-title p{color:#f4ddaa;font-size:14px}.cover b{position:absolute;z-index:1;right:0;bottom:34px;left:0;color:#f0cf83;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1;text-align:center;text-shadow:0 2px 9px rgba(0,0,0,.9)}@media print{body{margin:0}.cover{width:100%;max-height:268mm}article{break-after:page}}</style></head><body>${cover('cover--front', frontCoverContents)}<h1>Digitalna knjiga</h1>${books.map((job, index) => `<article><h2>${index + 1}. ${escapeHtml(job.document_name ?? job.original_filename ?? 'Dokument')}</h2><img class="document-image" src="${documentImages[index]}" alt=""><h3>Savremena latinica</h3><p>${escapeHtml(modernLatinica(job))}</p><h3>Normalizacija</h3>${paragraphs(job).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('') || '<p>Normalizacija nije dostupna za ovaj dokument.</p>'}</article>`).join('')}${cover('cover--back')}</body></html>`;
  };

  const exportBook = async (format: 'doc' | 'pdf') => {
    setExporting(true);
    try {
      const html = await exportHtml();
      if (format === 'doc') {
        downloadBlob(`\uFEFF${html}`, 'application/msword;charset=utf-8', 'digitalna-knjiga.doc');
        return;
      }
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.addEventListener('load', () => printWindow.print(), { once: true });
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="book-loading">Učitavam završene knjige…</div>;
  if (!books.length) return <div className="book-empty"><BookOpen size={36} /><p>Digitalna knjiga će prikazati obrađene dokumente.</p></div>;

  return <section className="book-workspace">
    <div ref={readerRef} className={`book-reader${readingMode ? ' is-reading-mode' : ''}${viewMode === 'pdf' ? ' is-pdf-view' : ''}`}>
      <div className="book-view-actions">
        {readingMode ? <Button className="book-reading-mode" variant="secondary" size="sm" onClick={() => void toggleReadingMode()}><Minimize2 size={16} /> Izađi iz čitanja</Button> : <>
          <Button className="book-reading-mode" variant="secondary" size="sm" onClick={() => { setViewMode('book'); void toggleReadingMode(); }}><Maximize2 size={16} /> Cijeli ekran</Button>
          <Button className={viewMode === 'book' ? 'is-active' : ''} variant="secondary" size="sm" onClick={() => setViewMode('book')}><BookOpen size={16} /> Knjiga</Button>
          <Button className={viewMode === 'pdf' ? 'is-active' : ''} variant="secondary" size="sm" onClick={() => setViewMode('pdf')}><FileText size={16} /> PDF prikaz</Button>
        </>}
      </div>
      {!readingMode && <div className="book-export-actions" ref={exportMenuRef}>
        <Button variant="secondary" size="sm" onClick={() => setExportMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={exportMenuOpen} disabled={exporting}>
          <Download size={15} /> Izvoz
        </Button>
        {exportMenuOpen && <div className="book-export-menu" role="menu">
          <Button role="menuitem" onClick={() => { void exportBook('doc'); setExportMenuOpen(false); }}><FileText size={15} /> DOC</Button>
          <Button role="menuitem" onClick={() => { void exportBook('pdf'); setExportMenuOpen(false); }}><Download size={15} /> PDF</Button>
        </div>}
      </div>}
      {viewMode === 'pdf' ? <section className="book-pdf-view">
        <article className="book-pdf-cover book-pdf-cover--front">
          <img className="book-pdf-cover__art" src={coverArtwork} alt="" />
          <div className="book-pdf-cover__veil" />
          <div className="book-pdf-cover__content">
            <div className="book-pdf-cover__top">
              <BookOpen size={38} strokeWidth={1.4} />
              <p>Digitalna baština Bosne i Hercegovine</p>
            </div>
            <div className="book-pdf-cover__title">
              <h2>Digitalna<br />knjiga</h2>
              <div />
              <p>Čuvamo rukopise.<br />Otkrivamo naslijeđe.</p>
            </div>
          </div>
          <p className="book-pdf-cover__bosancica">Bosančica</p>
        </article>
        <h1>Digitalna knjiga</h1>
        {books.map((job, index) => <article key={`${job.book_source}-${job.id}`} className="book-pdf-document">
          <p className="book-kicker">Dokument {index + 1}</p><h2>{job.document_name ?? job.original_filename}</h2>
          <img src={documentUrl(job)} alt="" />
          <h3>Savremena latinica</h3><p>{modernLatinica(job)}</p>
          <h3>Normalizacija</h3>{paragraphs(job).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        </article>)}
        <article className="book-pdf-cover book-pdf-cover--back">
          <img className="book-pdf-cover__art" src={coverArtwork} alt="" />
        </article>
      </section> : <HTMLFlipBook
        key={readingMode ? 'fullscreen-book' : 'workspace-book'}
        startPage={pageIndex}
        width={pageSize.width}
        height={pageSize.height}
        size="fixed"
        minWidth={280}
        maxWidth={10000}
        minHeight={390}
        maxHeight={10000}
        showCover usePortrait={false} mobileScrollSupport drawShadow={pageIndex !== 0}
        onFlip={(event: { data: number }) => setPageIndex(event.data)}
        className={`book-flip${pageIndex === 0 ? ' is-cover-closed' : ''}`}
      >
        <BookPage className="book-cover" data-density="hard">
          <img className="book-cover__art" src={coverArtwork} alt="" />
          <div className="book-cover__veil" />
          <div className="book-cover__content">
            <div className="book-cover__top">
              <BookOpen size={38} strokeWidth={1.4} />
              <p className="book-cover__eyebrow">Digitalna baština Bosne i Hercegovine</p>
            </div>
            <div className="book-cover__title">
              <h2>Digitalna<br />knjiga</h2>
              <div className="book-cover__rule" />
              <p>Čuvamo rukopise.<br />Otkrivamo naslijeđe.</p>
            </div>
          </div>
          <p className="book-cover__bosancica">Bosančica</p>
        </BookPage>
        {books.flatMap((job, documentIndex) => [
          <BookPage className={`book-original${documentIndex === 0 ? ' book-original--first' : ''}`} key={`${job.book_source}-${job.id}-original`}>
            <section className="book-half book-image-panel">
              <p className="book-kicker">Izvor · {job.document_name ?? job.original_filename}</p>
              <img src={documentUrl(job)} alt={job.document_name ?? 'Original dokument'} />
            </section>
            <section className="book-half book-latin-panel">
              <p className="book-kicker">Savremena latinica</p>
              <p className="book-latin">{modernLatinica(job)}</p>
            </section>
            <footer className="book-page__footer">{documentIndex * 2 + 1}</footer>
          </BookPage>,
          <BookPage className={`book-reading${documentIndex === 0 ? ' book-reading--first' : ''}`} key={`${job.book_source}-${job.id}-reading`}>
            <section className="book-half book-bosancica-panel">
              <p className="book-kicker">Digitalna Bosančica</p>
              <h3>{job.document_name ?? job.original_filename}</h3>
              <div className="book-bosancica">{job.ocr_job?.output_text}</div>
            </section>
            <section className="book-half book-normalization-panel">
              <p className="book-kicker">Normalizacija · savremeni bosanski</p>
              <div className="book-normalization-text">
                {paragraphs(job).length
                  ? paragraphs(job).map((paragraph, index) => <p className="book-normalized" key={index}>{paragraph}</p>)
                  : <p className="book-normalized book-normalized--empty">Normalizacija nije dostupna za ovaj dokument.</p>}
              </div>
            </section>
            <footer className="book-page__footer">{documentIndex * 2 + 2}</footer>
          </BookPage>,
        ])}
        <BookPage className="book-cover book-cover--end" data-density="hard">
          <img className="book-cover__art" src={coverArtwork} alt="" />
        </BookPage>
      </HTMLFlipBook>}
    </div>
  </section>;
}
