import { useEffect, useState } from 'react';
import { Boxes, Layers, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Badge } from '../components/DataTable';
import { DetailGrid, DetailLayout } from '../components/DetailLayout';
import { Row, Section } from '../components/DetailRow';
import { api } from '../services/api';
import { useResourceStore } from '../store/resourceStore';
import { useToastStore } from '../store/toastStore';
import { useUIStore } from '../store/uiStore';
import type { ImageDetail, ImageVariant } from '../types';
import { formatBytes, formatDuration, shortDigest, splitEnv } from '../utils/format';

export function ImageDetailPage({ reference }: { reference: string }) {
  const [detail, setDetail] = useState<ImageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variantIndex, setVariantIndex] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const back = useUIStore((s) => s.back);
  const openContainer = useUIStore((s) => s.openContainer);
  const images = useResourceStore((s) => s.images);
  const containers = useResourceStore((s) => s.containers);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    let cancelled = false;

    void api
      .inspectImage(reference)
      .then((result) => {
        if (cancelled) return;
        setDetail(result ?? null);
        setError(result ? null : 'This image is no longer available.');
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Could not inspect the image');
      });

    return () => {
      cancelled = true;
    };
  }, [reference]);

  // Other tags pointing at the same image, so the page covers the whole thing.
  const siblings = detail
    ? images.filter((i) => i.digest === detail.digest && i.reference !== detail.reference)
    : [];
  const users = containers.filter(
    (c) => c.image === reference || siblings.some((s) => s.reference === c.image)
  );

  const remove = async () => {
    setConfirmingDelete(false);
    try {
      await api.deleteImage(reference);
      pushToast(`Deleted ${reference}`);
      back();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not delete the image', 'error');
    }
  };

  const variant: ImageVariant | undefined = detail?.variants[variantIndex];

  return (
    <DetailLayout
      onBack={back}
      title={detail?.name ?? reference}
      badges={
        <>
          {detail && <Badge>{detail.tag}</Badge>}
          {siblings.map((s) => (
            <Badge key={s.reference}>{s.tag}</Badge>
          ))}
        </>
      }
      subtitle={detail ? shortDigest(detail.digest) : reference}
      actions={
        <button
          onClick={() => setConfirmingDelete(true)}
          className="btn-ghost text-orange-700 dark:text-orange-500"
        >
          <Trash2 size={13} aria-hidden />
          Delete
        </button>
      }
    >
      {error && !detail ? (
        <p className="flex flex-1 items-center justify-center text-sm text-ink-600 dark:text-ink-400">
          {error}
        </p>
      ) : !detail || !variant ? (
        <p className="flex flex-1 items-center justify-center text-sm text-ink-600 dark:text-ink-400">
          Inspecting image…
        </p>
      ) : (
        <DetailGrid>
          {detail.variants.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
              <span className="label-caps">Platform</span>
              {detail.variants.map((v, index) => (
                <button
                  key={v.digest || v.platform}
                  onClick={() => setVariantIndex(index)}
                  className={index === variantIndex ? 'btn-primary' : 'btn-ghost'}
                >
                  {v.platform}
                </button>
              ))}
            </div>
          )}

          <Section title="Image">
            <Row label="Reference" value={detail.reference} mono copyable />
            <Row label="Digest" value={detail.digest} mono copyable />
            <Row label="Platform" value={variant.platform} />
            <Row label="Size" value={formatBytes(variant.sizeInBytes)} />
            <Row label="Layers" value={variant.layers} />
            <Row
              label="Built"
              value={variant.createdAt ? `${formatDuration(variant.createdAt)} ago` : '—'}
            />
          </Section>

          <Section title="Default configuration">
            <Row label="Entrypoint" value={variant.entrypoint.join(' ')} mono />
            <Row label="Command" value={variant.command.join(' ')} mono />
            <Row label="Working directory" value={variant.workingDir} mono />
            <Row label="User" value={variant.user || 'root'} mono />
            <Row label="Exposed ports" value={variant.exposedPorts.join(', ')} mono />
          </Section>

          <Section title={`Environment (${variant.env.length})`}>
            {variant.env.map((entry) => {
              const [key, value] = splitEnv(entry);
              return <Row key={key} label={key} value={value || '—'} mono copyable />;
            })}
          </Section>

          <Section title="Used by">
            {users.length === 0 ? (
              <p className="text-xs text-ink-600 dark:text-ink-400">
                No container is running this image.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {users.map((container) => (
                  <button
                    key={container.id}
                    onClick={() => openContainer(container.id)}
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    <Boxes size={13} aria-hidden />
                    {container.name}
                  </button>
                ))}
              </div>
            )}
          </Section>

          {Object.keys(variant.labels).length > 0 && (
            <Section title="Labels">
              {Object.entries(variant.labels).map(([key, value]) => (
                <Row key={key} label={key} value={value} />
              ))}
            </Section>
          )}

          <Section
            title={`Build history (${variant.history.length} steps)`}
            span={showHistory}
            action={
              <button
                onClick={() => setShowHistory((prev) => !prev)}
                className="flex items-center gap-1 text-tiny font-semibold text-brand-700 hover:underline dark:text-brand-400"
              >
                <Layers size={12} aria-hidden />
                {showHistory ? 'Hide' : 'Show'}
              </button>
            }
          >
            {showHistory ? (
              <ol className="flex flex-col gap-1.5 border-l border-ink-200 pl-3 dark:border-ink-700">
                {variant.history.map((step, index) => (
                  <li key={index} className="flex flex-col gap-0.5">
                    <p className="selectable break-all font-mono text-tiny leading-relaxed">
                      {step.createdBy || '—'}
                    </p>
                    <p className="text-tiny text-ink-500">
                      {step.createdAt ? `${formatDuration(step.createdAt)} ago` : ''}
                      {step.comment && ` · ${step.comment}`}
                      {step.emptyLayer && ' · metadata only'}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="truncate text-xs text-ink-600 dark:text-ink-400">
                {variant.history[variant.history.length - 1]?.createdBy ?? '—'}
              </p>
            )}
          </Section>
        </DetailGrid>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete ${detail?.name ?? reference}?`}
          body={
            users.length > 0
              ? `It is used by ${users.map((c) => c.name).join(', ')}, which keeps running but cannot be recreated without pulling it again.`
              : 'The image will have to be pulled again to use it.'
          }
          confirmLabel="Delete"
          onConfirm={() => void remove()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </DetailLayout>
  );
}
