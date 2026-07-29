'use client';

import { useMemo, useState } from 'react';
import { Button } from './button';
import { MOCK_LIBRARY_ASSETS, type MockAsset } from '../../lib/mock-assets';

export function LibraryPickerModal({
  isOpen,
  onClose,
  onSelect,
  mediaType,
  title = 'Select from asset library',
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: MockAsset) => void;
  mediaType?: 'image' | 'video';
  title?: string;
}) {
  const [selected, setSelected] = useState<MockAsset | null>(null);

  const assets = useMemo(
    () =>
      mediaType
        ? MOCK_LIBRARY_ASSETS.filter((a) => a.type === mediaType)
        : MOCK_LIBRARY_ASSETS,
    [mediaType],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-[#050e3e]">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {assets.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              No {mediaType ?? ''} assets in the local library.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => setSelected(asset)}
                  className={`relative overflow-hidden rounded-lg border-2 transition-colors ${
                    selected?.id === asset.id
                      ? 'border-[#3c61f3]'
                      : 'border-transparent hover:border-slate-300'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.url}
                    alt={asset.name}
                    className="aspect-square w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
                    <p className="truncate text-[10px] font-medium text-white">
                      {asset.name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onSelect(selected);
                setSelected(null);
              }
            }}
          >
            Use selected
          </Button>
        </div>
      </div>
    </div>
  );
}
