import React, { useState } from "react";
import { Subscriber, ToastMessage } from "../types";
import { 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Edit3, 
  Plus, 
  Search, 
  Trash2, 
  UserCheck, 
  UserX, 
  Phone, 
  Tag, 
  Save,
  AlertCircle
} from "lucide-react";

interface Props {
  subscribers: Subscriber[];
  onToggleActive: (id: string) => Promise<void>;
  onUpdateSubscriber: (id: string, updated: Partial<Subscriber>) => Promise<boolean>;
  onAddSubscriber: (newSub: Omit<Subscriber, "id"> & { id: string }) => Promise<boolean>;
  onDeleteSubscriber: (id: string) => Promise<boolean>;
  onNotify: (type: ToastMessage["type"], text: string) => void;
}

export const SubscribersManager: React.FC<Props> = ({
  subscribers,
  onToggleActive,
  onUpdateSubscriber,
  onAddSubscriber,
  onDeleteSubscriber,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "paused">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form edit states per subscriber
  const [editForms, setEditForms] = useState<Record<string, {
    display_name: string;
    whatsapp_number: string;
    variants_input: string;
    active: boolean;
  }>>({});

  // New subscriber form state
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newVariants, setNewVariants] = useState("");
  const [newActive, setNewActive] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState(false);

  // Initialize edit form when expanding
  const toggleExpand = (sub: Subscriber) => {
    if (expandedId === sub.id) {
      setExpandedId(null);
    } else {
      setExpandedId(sub.id);
      setEditForms(prev => ({
        ...prev,
        [sub.id]: {
          display_name: sub.display_name,
          whatsapp_number: sub.whatsapp_number,
          variants_input: (sub.name_variants || []).join(", "),
          active: sub.active,
        }
      }));
    }
  };

  const handleEditChange = (id: string, field: string, value: any) => {
    setEditForms(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleSaveEdit = async (id: string) => {
    const data = editForms[id];
    if (!data) return;

    if (!data.display_name.trim()) {
      onNotify("error", "Display Name cannot be blank.");
      return;
    }
    if (!data.whatsapp_number.trim()) {
      onNotify("error", "WhatsApp telephone number cannot be blank.");
      return;
    }

    const parsedVariants = data.variants_input
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if (parsedVariants.length === 0) {
      onNotify("error", "At least one name variant alias is required for case matching.");
      return;
    }

    const success = await onUpdateSubscriber(id, {
      display_name: data.display_name.trim(),
      whatsapp_number: data.whatsapp_number.trim(),
      name_variants: parsedVariants,
      active: data.active,
    });

    if (success) {
      setExpandedId(null);
    }
  };

  // Inline validation for New Subscriber Form
  const validateNewForm = () => {
    const errors: Record<string, string> = {};
    const cleanId = newId.trim().toUpperCase();

    if (!cleanId) {
      errors.id = "Subscriber ID is required (e.g. SUB-011)";
    } else if (subscribers.some(s => s.id.toUpperCase() === cleanId)) {
      errors.id = `ID '${cleanId}' is already registered to another advocate.`;
    }

    if (!newName.trim()) {
      errors.name = "Advocate display name is required.";
    }

    if (!newPhone.trim()) {
      errors.phone = "WhatsApp number is required (with country code).";
    } else if (!/^\+?[0-9\s\-()]{8,20}$/.test(newPhone.trim())) {
      errors.phone = "Enter valid phone digits with country code (e.g. +919820123456).";
    }

    if (!newVariants.trim()) {
      errors.variants = "Provide at least one name variant (e.g. 'R. K. Sharma, Rajesh Sharma').";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddNewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateNewForm()) {
      onNotify("warning", "Please correct the form errors before submitting.");
      return;
    }

    const parsedVariants = newVariants
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const success = await onAddSubscriber({
      id: newId.trim().toUpperCase(),
      display_name: newName.trim(),
      whatsapp_number: newPhone.trim(),
      name_variants: parsedVariants,
      active: newActive,
    });

    if (success) {
      // Reset form
      setNewId("");
      setNewName("");
      setNewPhone("");
      setNewVariants("");
      setNewActive(true);
      setFormErrors({});
      setShowAddModal(false);
    }
  };

  // Suggest next ID
  const suggestNextId = () => {
    const nextNum = subscribers.length + 1;
    return `SUB-${String(nextNum).padStart(3, "0")}`;
  };

  const openAddModal = () => {
    setNewId(suggestNextId());
    setFormErrors({});
    setShowAddModal(true);
  };

  // Filtered subscribers list
  const filteredSubscribers = subscribers.filter(sub => {
    const matchesSearch = 
      sub.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.whatsapp_number.includes(searchQuery) ||
      (sub.name_variants || []).some(v => v.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterActive === "active") return sub.active;
    if (filterActive === "paused") return !sub.active;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              id="search-subscribers-input"
              type="text"
              placeholder="Search by name, ID, or variant alias..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium text-slate-600">
            <button
              id="filter-all-btn"
              onClick={() => setFilterActive("all")}
              className={`px-3 py-1 rounded-md transition-all ${
                filterActive === "all" ? "bg-white text-slate-900 shadow-xs font-semibold" : "hover:text-slate-900"
              }`}
            >
              All ({subscribers.length})
            </button>
            <button
              id="filter-active-btn"
              onClick={() => setFilterActive("active")}
              className={`px-3 py-1 rounded-md transition-all ${
                filterActive === "active" ? "bg-emerald-50 text-emerald-700 shadow-xs font-semibold" : "hover:text-slate-900"
              }`}
            >
              Active ({subscribers.filter(s => s.active).length})
            </button>
            <button
              id="filter-paused-btn"
              onClick={() => setFilterActive("paused")}
              className={`px-3 py-1 rounded-md transition-all ${
                filterActive === "paused" ? "bg-amber-50 text-amber-700 shadow-xs font-semibold" : "hover:text-slate-900"
              }`}
            >
              Paused ({subscribers.filter(s => !s.active).length})
            </button>
          </div>
        </div>

        <button
          id="add-subscriber-btn"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-xs transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Advocate Subscriber
        </button>
      </div>

      {/* Subscriber Cards List */}
      <div className="space-y-3">
        {filteredSubscribers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
            <p className="text-base font-medium">No subscribers match your search.</p>
            <p className="text-xs text-slate-400 mt-1">Try broadening your search term or add a new subscriber.</p>
          </div>
        ) : (
          filteredSubscribers.map((sub) => {
            const isExpanded = expandedId === sub.id;
            const editState = editForms[sub.id] || {
              display_name: sub.display_name,
              whatsapp_number: sub.whatsapp_number,
              variants_input: (sub.name_variants || []).join(", "),
              active: sub.active,
            };

            return (
              <div
                key={sub.id}
                id={`subscriber-card-${sub.id}`}
                className={`bg-white rounded-xl border transition-all ${
                  isExpanded 
                    ? "border-sky-300 ring-2 ring-sky-50 shadow-md" 
                    : "border-slate-200 hover:border-slate-300 shadow-xs"
                }`}
              >
                {/* Main Collapsed Header */}
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div 
                    className="flex-1 cursor-pointer flex items-start gap-3"
                    onClick={() => toggleExpand(sub)}
                  >
                    <div className="mt-0.5">
                      {sub.active ? (
                        <span className="flex h-3 w-3 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full h-3 w-3 bg-slate-300"></span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-slate-900">{sub.display_name}</h4>
                        <span className="text-xs font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                          {sub.id}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          sub.active 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}>
                          {sub.active ? "Active" : "Paused"}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="h-3 w-3 text-slate-400" />
                          {sub.whatsapp_number}
                        </span>
                        <span className="flex items-center gap-1">
                          <Tag className="h-3 w-3 text-slate-400" />
                          {sub.name_variants?.length || 0} variant(s):{" "}
                          <span className="text-slate-700 italic">
                            {(sub.name_variants || []).slice(0, 3).join(", ")}
                            {(sub.name_variants?.length || 0) > 3 ? "..." : ""}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Quick Toggle */}
                  <div className="flex items-center gap-3 self-end md:self-center">
                    {/* Working Active/Paused Toggle with Instant Persistence */}
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                      <span className="text-xs font-medium text-slate-600">Dispatch:</span>
                      <button
                        id={`toggle-active-${sub.id}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleActive(sub.id);
                        }}
                        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          sub.active ? "bg-emerald-600" : "bg-slate-300"
                        }`}
                        role="switch"
                        aria-checked={sub.active}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            sub.active ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    <button
                      id={`edit-expand-btn-${sub.id}`}
                      onClick={() => toggleExpand(sub)}
                      className="p-2 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                      title={isExpanded ? "Collapse edit card" : "Edit subscriber"}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Live Edit Form */}
                {isExpanded && (
                  <div className="border-t border-slate-100 p-5 bg-slate-50/60 rounded-b-xl space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={editState.display_name}
                          onChange={(e) => handleEditChange(sub.id, "display_name", e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                          placeholder="Advocate Display Name"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          WhatsApp Number (with Country Code)
                        </label>
                        <input
                          type="text"
                          value={editState.whatsapp_number}
                          onChange={(e) => handleEditChange(sub.id, "whatsapp_number", e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                          placeholder="+919820123456"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Name Variants (comma-separated, case-insensitive substring match)
                      </label>
                      <textarea
                        rows={2}
                        value={editState.variants_input}
                        onChange={(e) => handleEditChange(sub.id, "variants_input", e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-hidden"
                        placeholder="e.g. Rajesh Sharma, R. K. Sharma, Rajesh K Sharma, R.Sharma"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        High Court cause lists frequently spell or abbreviate lawyer names differently. Enter all known variations separated by commas.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editState.active}
                          onChange={(e) => handleEditChange(sub.id, "active", e.target.checked)}
                          className="h-4 w-4 rounded-sm border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-xs font-medium text-slate-700">
                          Active (Will receive daily WhatsApp dispatch)
                        </span>
                      </label>

                      <div className="flex items-center gap-2">
                        <button
                          id={`delete-subscriber-${sub.id}`}
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to remove ${sub.display_name} (${sub.id})?`)) {
                              onDeleteSubscriber(sub.id);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>

                        <button
                          id={`save-subscriber-${sub.id}`}
                          type="button"
                          onClick={() => handleSaveEdit(sub.id)}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-xs transition-colors"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Save Changes
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Subscriber Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Register New Advocate</h3>
                <p className="text-xs text-slate-500">Add a new paid lawyer subscriber to the WhatsApp dispatch list</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNewSubmit} className="space-y-4 pt-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Subscriber ID *
                  </label>
                  <input
                    id="new-sub-id-input"
                    type="text"
                    value={newId}
                    onChange={(e) => {
                      setNewId(e.target.value.toUpperCase());
                      if (formErrors.id) setFormErrors(prev => ({ ...prev, id: "" }));
                    }}
                    placeholder="SUB-011"
                    className={`w-full px-3 py-2 border rounded-lg text-sm font-mono uppercase focus:outline-hidden ${
                      formErrors.id ? "border-rose-400 bg-rose-50" : "border-slate-300 focus:ring-2 focus:ring-sky-500"
                    }`}
                  />
                  {formErrors.id && <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.id}</p>}
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Advocate Display Name *
                  </label>
                  <input
                    id="new-sub-name-input"
                    type="text"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (formErrors.name) setFormErrors(prev => ({ ...prev, name: "" }));
                    }}
                    placeholder="e.g. Adv. Rohit Deshpande"
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-hidden ${
                      formErrors.name ? "border-rose-400 bg-rose-50" : "border-slate-300 focus:ring-2 focus:ring-sky-500"
                    }`}
                  />
                  {formErrors.name && <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.name}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  WhatsApp Number (with Country Code) *
                </label>
                <input
                  id="new-sub-phone-input"
                  type="text"
                  value={newPhone}
                  onChange={(e) => {
                    setNewPhone(e.target.value);
                    if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: "" }));
                  }}
                  placeholder="+919876543210"
                  className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-hidden ${
                    formErrors.phone ? "border-rose-400 bg-rose-50" : "border-slate-300 focus:ring-2 focus:ring-sky-500"
                  }`}
                />
                {formErrors.phone && <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.phone}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Name Variants (comma-separated) *
                </label>
                <textarea
                  id="new-sub-variants-input"
                  rows={2}
                  value={newVariants}
                  onChange={(e) => {
                    setNewVariants(e.target.value);
                    if (formErrors.variants) setFormErrors(prev => ({ ...prev, variants: "" }));
                  }}
                  placeholder="e.g. Rohit Deshpande, R. Deshpande, Rohit D."
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-hidden ${
                    formErrors.variants ? "border-rose-400 bg-rose-50" : "border-slate-300 focus:ring-2 focus:ring-sky-500"
                  }`}
                />
                {formErrors.variants ? (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.variants}</p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Matching is case-insensitive substring across every cell in each row.
                  </p>
                )}
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newActive}
                    onChange={(e) => setNewActive(e.target.checked)}
                    className="h-4 w-4 rounded-sm border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Active immediately (included in today's dispatch)
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="submit-new-subscriber-btn"
                  type="submit"
                  className="px-5 py-2 text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-xs transition-colors"
                >
                  Register Subscriber
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
