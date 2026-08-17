import { useMemo, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  Badge,
  DataTable,
  Muted,
  NameCell,
  SelectionActions,
  type Column,
} from '../components/DataTable';
import { Field, Modal } from '../components/form';
import { TaskRows, runTask } from '../components/TaskRows';
import { api } from '../services/api';
import { useResourceStore } from '../store/resourceStore';
import { useToastStore } from '../store/toastStore';
import { PageHeader } from '../components/PageHeader';
import { useUIStore } from '../store/uiStore';
import type { Image } from '../types';
import { formatBytes, formatDuration, shortDigest } from '../utils/format';

/**
 * One physical image, however many references point at it. `redis:8.10` and
 * `redis:latest` share a digest, so they belong on one row rather than looking
 * like two separate downloads.
 */
interface ImageGroup {
  digest: string;
  names: string[];
  tags: { tag: string; reference: string }[];
  platforms: string[];
  createdAt: string;
  sizeInBytes: number;
}

function groupByDigest(images: Image[]): ImageGroup[] {
  const groups = new Map<string, ImageGroup>();

  for (const image of images) {
    // Without a digest there is nothing to merge on; keep the reference alone.
    const key = image.digest || image.reference;
    const group = groups.get(key);

    if (!group) {
      groups.set(key, {
        digest: image.digest,
        names: [image.name],
        tags: [{ tag: image.tag, reference: image.reference }],
        platforms: [...image.platforms],
        createdAt: image.createdAt,
        sizeInBytes: image.sizeInBytes,
      });
      continue;
    }

    if (!group.names.includes(image.name)) group.names.push(image.name);
    group.tags.push({ tag: image.tag, reference: image.reference });
    for (const platform of image.platforms) {
      if (!group.platforms.includes(platform)) group.platforms.push(platform);
    }
  }

  for (const group of groups.values()) {
    // "latest" first, then the rest alphabetically -- the version you reach for.
    group.tags.sort((a, b) =>
      a.tag === 'latest' ? -1 : b.tag === 'latest' ? 1 : a.tag.localeCompare(b.tag)
    );
  }

  return [...groups.values()].sort((a, b) => a.names[0].localeCompare(b.names[0]));
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Repository', width: 'minmax(160px,1.6fr)' },
  { key: 'tags', label: 'Tags', width: 'minmax(120px,1fr)' },
  { key: 'digest', label: 'Digest', width: '116px' },
  { key: 'platform', label: 'Platform', width: '124px' },
  { key: 'size', label: 'Size', width: '84px', align: 'right' },
  { key: 'built', label: 'Built', width: '72px', align: 'right' },
];

export function ImagesPage() {
  const images = useResourceStore((s) => s.images);
  const containers = useResourceStore((s) => s.containers);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const openImage = useUIStore((s) => s.openImage);
  const pushToast = useToastStore((s) => s.push);

  const [pulling, setPulling] = useState(false);
  const [deleting, setDeleting] = useState<ImageGroup | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => groupByDigest(images), [images]);

  const needle = searchQuery.trim().toLowerCase();
  const visible = groups.filter(
    (group) =>
      !needle ||
      group.names.some((n) => n.toLowerCase().includes(needle)) ||
      group.tags.some((t) => t.reference.toLowerCase().includes(needle))
  );

  const totalSize = groups.reduce((sum, g) => sum + g.sizeInBytes, 0);

  const usersOf = (group: ImageGroup) =>
    containers.filter((c) => group.tags.some((t) => t.reference === c.image)).map((c) => c.name);

  const remove = async (group: ImageGroup) => {
    setDeleting(null);
    setRemoving(group.digest);

    // Every reference in the group points at the same image; removing one tag
    // would leave the others behind, so the row action removes them all.
    const failures: string[] = [];
    for (const { reference } of group.tags) {
      try {
        await api.deleteImage(reference);
      } catch {
        failures.push(reference);
      }
    }

    setRemoving(null);

    if (failures.length > 0) {
      pushToast(`Could not delete ${failures.join(', ')}`, 'error');
    } else {
      pushToast(`Deleted ${group.names[0]}`);
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <PageHeader
        title="Images"
        subtitle={`${groups.length} image${groups.length === 1 ? '' : 's'}${
          images.length !== groups.length ? ` · ${images.length} references` : ''
        } · ${formatBytes(totalSize)}`}
        search={{ value: searchQuery, onChange: setSearchQuery, placeholder: 'Search images…' }}
        actions={
          selected.size > 0 ? (
            <SelectionActions count={selected.size} onClear={() => setSelected(new Set())}>
              <Button
                icon={Trash2}
                busy={busy}
                busyLabel="Deleting…"
                className="text-orange-700 dark:text-orange-500"
                onClick={() => setBulkDeleting(true)}
              >
                Delete
              </Button>
            </SelectionActions>
          ) : (
            <button onClick={() => setPulling(true)} className="btn-primary">
              <Download size={13} aria-hidden />
              Pull image
            </button>
          )
        }
      />

      <TaskRows kind="image" />

      <DataTable
        columns={COLUMNS}
        rows={visible}
        rowKey={(group) => group.digest}
        onOpen={(group) => openImage(group.tags[0].reference)}
        selection={{ selected, onChange: setSelected }}
        empty={
          images.length === 0
            ? 'No images yet. Pull one to get started.'
            : 'No images match your search.'
        }
        cells={(group) => {
          const users = usersOf(group);

          return [
            <NameCell key="name">
              <span className="truncate text-sm font-semibold">{group.names.join(', ')}</span>
              {users.length > 0 && <Badge tone="brand">in use</Badge>}
            </NameCell>,
            <div key="tags" className="flex flex-wrap items-center gap-1">
              {group.tags.map(({ tag }) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>,
            <Muted key="digest" mono>
              {shortDigest(group.digest)}
            </Muted>,
            <Muted key="platform">{group.platforms.join(', ') || '—'}</Muted>,
            <Muted key="size">{formatBytes(group.sizeInBytes)}</Muted>,
            <Muted key="built">{group.createdAt ? formatDuration(group.createdAt) : '—'}</Muted>,
          ];
        }}
        actions={(group) => (
          <IconButton
            icon={Trash2}
            busy={removing === group.digest}
            className={`border-transparent text-orange-700 dark:text-orange-500 ${
              removing === group.digest ? '' : 'opacity-0 group-hover:opacity-100'
            }`}
            title={group.tags.length > 1 ? `Delete all ${group.tags.length} references` : 'Delete'}
            aria-label={`Delete ${group.names[0]}`}
            onClick={() => setDeleting(group)}
          />
        )}
      />

      {bulkDeleting && (
        <ConfirmDialog
          title={`Delete ${selected.size} image${selected.size === 1 ? '' : 's'}?`}
          body={`Every reference to ${visible
            .filter((g) => selected.has(g.digest))
            .map((g) => g.names[0])
            .join(', ')} is removed. They have to be pulled again to use.`}
          confirmLabel="Delete"
          onConfirm={() => {
            setBulkDeleting(false);
            void (async () => {
              setBusy(true);
              const failed: string[] = [];
              for (const group of groups.filter((g) => selected.has(g.digest))) {
                for (const { reference } of group.tags) {
                  try {
                    await api.deleteImage(reference);
                  } catch {
                    failed.push(reference);
                  }
                }
              }
              setBusy(false);
              setSelected(new Set());
              pushToast(
                failed.length > 0 ? `Could not delete ${failed.join(', ')}` : 'Images deleted',
                failed.length > 0 ? 'error' : 'success'
              );
            })();
          }}
          onCancel={() => setBulkDeleting(false)}
        />
      )}

      {pulling && <PullDialog onClose={() => setPulling(false)} />}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.names[0]}?`}
          body={[
            deleting.tags.length > 1
              ? `All ${deleting.tags.length} references share this image and will be removed: ${deleting.tags
                  .map((t) => t.reference)
                  .join(', ')}.`
              : 'The image will have to be pulled again to use it.',
            usersOf(deleting).length > 0
              ? `It is used by ${usersOf(deleting).join(', ')}, which keeps running but cannot be recreated without pulling it again.`
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          confirmLabel="Delete"
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/** Just the reference: the pull itself reports progress in the list. */
function PullDialog({ onClose }: { onClose: () => void }) {
  const [reference, setReference] = useState('');

  const pull = () => {
    const target = reference.trim();
    onClose();
    void runTask({
      id: `pull:${target}`,
      kind: 'image',
      label: target,
      method: 'images.pull',
      params: { reference: target },
    });
  };

  return (
    <Modal
      title="Pull image"
      subtitle="Progress appears in the list; you can keep working while it downloads."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={pull} className="btn-primary" disabled={!reference.trim()}>
            Pull
          </button>
        </>
      }
    >
      <Field label="Reference" hint="For example redis:8.10 or ghcr.io/owner/app:1.2.3">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reference.trim() && pull()}
          placeholder="redis:8.10"
          autoFocus
          className="input"
        />
      </Field>
    </Modal>
  );
}
