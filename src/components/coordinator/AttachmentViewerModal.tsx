import { useEffect, useState } from 'react';
import { X, Download, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  path: string;
  onClose: () => void;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'];

function getExtension(path: string) {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Views an appeal's attached file in-app instead of leaving the coordinator
 * with no way to see it. The 'appeal-files' storage bucket is private, so
 * this fetches a short-lived signed URL rather than a public one.
 * - Images: rendered inline.
 * - PDFs: embedded via <iframe> (browsers render PDFs natively).
 * - Everything else (Word docs, etc.): browsers can't render these inline,
 *   so this offers a direct download link instead of a broken preview.
 */
export default function AttachmentViewerModal({ path, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.storage.from('appeal-files').createSignedUrl(path, 60 * 10); // 10 minutes
    if (error || !data?.signedUrl) {
      setError('Unable to load this attachment. ' + (error?.message ?? ''));
    } else {
      setSignedUrl(data.signedUrl);
    }
    setLoading(false);
  }

  const extension = getExtension(path);
  const isImage = IMAGE_EXTENSIONS.includes(extension);
  const isPdf = extension === 'pdf';
  const fileName = path.split('/').pop() ?? 'attachment';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel max-h-[85vh] max-w-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-surface-line px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="icon-tile h-8 w-8 rounded-lg">
              <FileText size={15} strokeWidth={2.25} />
            </span>
            <p className="truncate text-sm font-semibold text-ink-900">{fileName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {signedUrl && (
              <a href={signedUrl} download={fileName} className="btn-secondary !px-3 !py-1.5">
                <Download size={14} /> Download
              </a>
            )}
            <button onClick={onClose} className="btn-icon h-8 w-8" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex min-h-[300px] items-center justify-center p-4">
          {loading && <Loader2 size={24} className="animate-spin text-clinical-500" />}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl3 bg-gradient-to-br from-status-expired/25 to-status-expired/5 text-status-expired ring-1 ring-inset ring-status-expired/30">
                <AlertTriangle size={21} strokeWidth={2.25} />
              </span>
              <p className="max-w-sm text-sm leading-relaxed text-ink-500">{error}</p>
            </div>
          )}

          {!loading && !error && signedUrl && isImage && (
            <img src={signedUrl} alt={fileName} className="max-h-[70vh] w-auto rounded-xl2 object-contain shadow-lift" />
          )}

          {!loading && !error && signedUrl && isPdf && (
            <iframe src={signedUrl} title={fileName} className="h-[70vh] w-full rounded-xl2 border border-surface-line" />
          )}

          {!loading && !error && signedUrl && !isImage && !isPdf && (
            <div className="flex flex-col items-center gap-3.5 py-8 text-center">
              <div className="icon-tile h-14 w-14 rounded-xl3">
                <FileText size={24} strokeWidth={2.25} />
              </div>
              <p className="text-sm text-ink-700">This file type can't be previewed in-browser.</p>
              <a href={signedUrl} download={fileName} className="btn-primary">
                <Download size={14} /> Download {fileName}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
