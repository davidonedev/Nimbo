import { useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FilterSelect } from '@/components/ui/filter-select';
import { ServiceCard } from '@/components/services/ServiceCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useProfessional } from '@/context/ProfessionalContext';
import { ApiError } from '@/lib/api';
import type { Service } from '@/types';
import type { ServicePayload } from '@/services/services.service';

// ─── Tipos de formulário ───────────────────────────────────────────────────────
interface FormData {
  name: string;
  description: string;
  price: string;
  duration: string;
  category: string;
}

const EMPTY_FORM: FormData = { name: '', description: '', price: '', duration: '', category: '' };

function formFromService(s: Service): FormData {
  return {
    name: s.name,
    description: s.description ?? '',
    price: String(s.price),
    duration: String(s.duration),
    category: s.category ?? '',
  };
}

function toPayload(f: FormData): ServicePayload {
  return {
    name: f.name.trim(),
    description: f.description.trim() || undefined,
    price: parseFloat(f.price),
    duration: parseInt(f.duration, 10),
    category: f.category.trim() || undefined,
  };
}

function validateForm(f: FormData): string {
  if (!f.name.trim()) return 'Nome é obrigatório.';
  if (!f.price || isNaN(parseFloat(f.price)) || parseFloat(f.price) <= 0) return 'Preço deve ser positivo.';
  if (!f.duration || isNaN(parseInt(f.duration)) || parseInt(f.duration) <= 0) return 'Duração deve ser positiva (minutos).';
  return '';
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function ProfServicesView() {
  const { services, addService, updateService, deleteService } = useProfessional();

  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Dialog criar
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FormData>(EMPTY_FORM);

  // Dialog editar
  const [editTarget, setEditTarget] = useState<Service | null>(null);
  const [editForm, setEditForm]     = useState<FormData>(EMPTY_FORM);

  // Dialog excluir
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);

  // Categorias únicas para filtro
  const categories = Array.from(new Set(services.map(s => s.category).filter(Boolean))) as string[];
  const [filterCategory, setFilterCategory] = useState('');

  const filtered = services.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.category ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || s.category === filterCategory;
    return matchSearch && matchCat;
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const err = validateForm(createForm);
    if (err) { setError(err); return; }
    setSaving(true); setError('');
    try {
      await addService(toPayload(createForm));
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao criar serviço.');
    } finally { setSaving(false); }
  };

  const openEdit = (s: Service) => {
    setEditTarget(s);
    setEditForm(formFromService(s));
    setError('');
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    const err = validateForm(editForm);
    if (err) { setError(err); return; }
    setSaving(true); setError('');
    try {
      await updateService(editTarget.id, toPayload(editForm));
      setEditTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao salvar serviço.');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteService(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao excluir serviço.');
    } finally { setSaving(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Serviços</h2>
          <p className="text-muted-foreground text-sm">{services.length} serviços disponíveis</p>
        </div>
        <Button onClick={() => { setCreateForm(EMPTY_FORM); setError(''); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Serviço
        </Button>
      </div>

      {/* Filtros: busca e uma caixa de seleção de categoria */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="h-11 pl-9 sm:h-10" placeholder="Buscar por nome, descrição ou categoria..." aria-label="Buscar serviço" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {categories.length > 0 && (
          <FilterSelect className="sm:max-w-xs" label="Categoria" value={filterCategory} onChange={setFilterCategory}
            options={[{ value: '', label: 'Todas', count: services.length }, ...categories.map(c => ({ value: c, label: c, count: services.filter(s => s.category === c).length }))]} />
        )}
      </div>

      {/* Grade de serviços */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(service => (
          <ServiceCard key={service.id} service={service} onEdit={openEdit} onDelete={setDeleteTarget} />
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-16">
            {services.length === 0 ? 'Nenhum serviço cadastrado ainda.' : 'Nenhum serviço encontrado.'}
          </div>
        )}
      </div>

      {/* ── Dialog: Criar ─────────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={o => { if (!saving) { setCreateOpen(o); setError(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Serviço</DialogTitle>
          </DialogHeader>
          <ServiceForm form={createForm} onChange={setCreateForm} error={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</> : 'Criar Serviço'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar ────────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={o => { if (!saving && !o) { setEditTarget(null); setError(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Serviço — {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <ServiceForm form={editForm} onChange={setEditForm} error={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Excluir ───────────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Serviço</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong className="text-foreground">{deleteTarget?.name}</strong>?
            Agendamentos existentes não serão afetados.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo...</> : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ─── Formulário compartilhado ─────────────────────────────────────────────────
function ServiceForm({
  form, onChange, error,
}: {
  form: FormData;
  onChange: React.Dispatch<React.SetStateAction<FormData>>;
  error: string;
}) {
  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nome *</Label>
        <Input placeholder="Ex: Corte masculino" value={form.name} onChange={set('name')} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Preço (R$) *</Label>
          <Input type="number" min="0" step="0.01" placeholder="50.00" value={form.price} onChange={set('price')} />
        </div>
        <div className="space-y-1.5">
          <Label>Duração (min) *</Label>
          <Input type="number" min="1" step="1" placeholder="30" value={form.duration} onChange={set('duration')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <Input placeholder="Ex: Cabelo, Barba, Estética..." value={form.category} onChange={set('category')} />
      </div>

      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Textarea placeholder="Descrição opcional do serviço..." rows={3} value={form.description} onChange={set('description')} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
