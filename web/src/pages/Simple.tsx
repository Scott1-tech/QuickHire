import { PageHeader, Empty } from '@/ui';

export default function Simple({ title }: { title: string }) {
  return (
    <>
      <PageHeader crumbs={[{ label: title }]} />
      <div className="flex-1 overflow-y-auto p-6">
        <Empty icon="🧩" title={`${title}`} sub="// TODO: connect to API — screen scaffold ready for build-out." />
      </div>
    </>
  );
}
