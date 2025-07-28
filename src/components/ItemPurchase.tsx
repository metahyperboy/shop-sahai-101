import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit, Check, X } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { universalNumberParser } from "@/services/voiceCommandService";

interface ItemPurchaseProps {
  language: string;
  filter?: string;
}

interface PurchaseItem {
  id: string;
  supplier_name: string;
  created_at: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  transaction_id: string;
}

const PAGE_SIZE = 20;

const ItemPurchase = ({ language, filter = 'monthly' }: ItemPurchaseProps) => {
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [newItem, setNewItem] = useState({
    supplierName: "",
    totalAmount: "",
    amountPaid: ""
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<{
    supplierName: string;
    totalAmount: string;
    amountPaid: string;
  }>({
    supplierName: "",
    totalAmount: "",
    amountPaid: ""
  });
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  // Remove: const [filter, setFilter] = useState<'daily' | 'weekly' | 'monthly' | 'all'>('all');
  // Use the filter prop or fallback to state
  // Fix: Ensure initial value for internalFilter is always a valid filter type
  const [internalFilter, setInternalFilter] = useState<'daily' | 'weekly' | 'monthly' | 'all'>(typeof filter === 'string' ? (filter as 'daily' | 'weekly' | 'monthly' | 'all') : 'monthly');
  const activeFilter = typeof filter === 'string' ? (filter as 'daily' | 'weekly' | 'monthly' | 'all') : internalFilter;

  const isEnglish = language === "english";

  // Helper to detect Malayalam text
  const isMalayalam = (text: string) => /[\u0D00-\u0D7F]/.test(text);

  // Fetch purchases from Supabase
  const fetchPurchases = async (reset = false) => {
    setLoading(true);
    try {
      let query = supabase
        .from('purchases')
        .select('id,supplier_name,created_at,total_amount,amount_paid,balance,transaction_id')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      if (activeFilter === 'daily') {
        query = query.gte('created_at', startOfDay.toISOString());
      } else if (activeFilter === 'weekly') {
        query = query.gte('created_at', startOfWeek.toISOString());
      } else if (activeFilter === 'monthly') {
        query = query.gte('created_at', startOfMonth.toISOString());
      }
      const { data, error } = await query;
      if (error) throw error;
      if (reset) {
      setItems(data || []);
      } else {
        setItems(prev => [...prev, ...(data || [])]);
      }
      setHasMore((data || []).length === PAGE_SIZE);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch purchases",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchPurchases(true);
    const handleDataUpdated = () => {
      setPage(1);
      fetchPurchases(true);
      toast({ title: 'Data Updated', description: 'Purchase data refreshed.', variant: 'default' });
      console.log('[ItemPurchase] Data updated event received, purchases refreshed.');
    };
    window.addEventListener('data-updated', handleDataUpdated);
    return () => {
      window.removeEventListener('data-updated', handleDataUpdated);
    };
  }, [activeFilter]);

  useEffect(() => {
    const handleAddPurchase = async (e: any) => {
      const { supplierName, totalAmount, amountPaid } = e.detail || {};
      if (supplierName && totalAmount) {
        addItem(supplierName, totalAmount, amountPaid || '');
      }
    };
    window.addEventListener('add-purchase', handleAddPurchase);
    return () => window.removeEventListener('add-purchase', handleAddPurchase);
  }, []);

  const addItem = async (
    supplierNameParam?: string,
    totalAmountParam?: string,
    amountPaidParam?: string
  ) => {
    const supplierName = supplierNameParam ?? newItem.supplierName;
    let totalAmountStr = totalAmountParam ?? newItem.totalAmount;
    let amountPaidStr = amountPaidParam ?? newItem.amountPaid;
    // Convert Malayalam/English number words to digits
    const parsedTotal = universalNumberParser(totalAmountStr);
    if (parsedTotal !== null) totalAmountStr = parsedTotal.toString();
    const parsedPaid = universalNumberParser(amountPaidStr);
    if (parsedPaid !== null) amountPaidStr = parsedPaid.toString();
    console.log('[ItemPurchase] addItem called with:', { supplierName, totalAmountStr, amountPaidStr });
    // Validation
    if (!supplierName.trim()) {
      toast({ title: "Validation Error", description: "Supplier name cannot be empty.", variant: "destructive" });
      return;
    }
    if (!totalAmountStr || isNaN(Number(totalAmountStr)) || Number(totalAmountStr) <= 0) {
      toast({ title: "Validation Error", description: "Total amount must be a positive number.", variant: "destructive" });
      return;
    }
    if (amountPaidStr && (isNaN(Number(amountPaidStr)) || Number(amountPaidStr) < 0)) {
      toast({ title: "Validation Error", description: "Amount paid must be zero or a positive number.", variant: "destructive" });
      return;
    }
    if (!isSubmitting) {
      setIsSubmitting(true);
      const totalAmount = parseFloat(totalAmountStr) || 0;
      const amountPaid = parseFloat(amountPaidStr) || 0;
      const balance = totalAmount - amountPaid;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        const { error } = await supabase
          .from('purchases')
          .insert({
            user_id: user.id,
            supplier_name: supplierName,
            total_amount: totalAmount,
            amount_paid: amountPaid,
            balance
          });
        if (error) throw error;
        toast({
          title: "Saved!",
          description: `Supplier: ${supplierName}, Amount: ₹${totalAmount}, Paid: ₹${amountPaid}`,
          variant: "default"
        });
        setNewItem({ supplierName: "", totalAmount: "", amountPaid: "" });
        await fetchPurchases();
        window.dispatchEvent(new CustomEvent('data-updated'));
        console.log('[ItemPurchase] data-updated event fired after DB write.');
      } catch (error: any) {
        console.error('[ItemPurchase] Error adding purchase:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to add purchase",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const deleteItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('purchases')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Purchase deleted successfully",
      });

      fetchPurchases();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete purchase",
        variant: "destructive",
      });
    }
  };

  const startEdit = (item: PurchaseItem) => {
    setEditingId(item.id);
    setEditItem({
      supplierName: item.supplier_name,
      totalAmount: item.total_amount.toString(),
      amountPaid: item.amount_paid.toString()
    });
  };

  const saveEdit = async () => {
    if (editingId && editItem.supplierName && editItem.totalAmount) {
      const totalAmount = parseFloat(editItem.totalAmount) || 0;
      const amountPaid = parseFloat(editItem.amountPaid) || 0;
      const balance = totalAmount - amountPaid;

      try {
        const { error } = await supabase
          .from('purchases')
          .update({
            supplier_name: editItem.supplierName,
            total_amount: totalAmount,
            amount_paid: amountPaid,
            balance
          })
          .eq('id', editingId);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Purchase updated successfully",
        });

        setEditingId(null);
        setEditItem({ supplierName: "", totalAmount: "", amountPaid: "" });
        fetchPurchases();
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to update purchase",
          variant: "destructive",
        });
      }
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditItem({ supplierName: "", totalAmount: "", amountPaid: "" });
  };

  // Filter purchases based on time period
  const filterPurchases = () => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    switch (activeFilter) {
      case 'daily':
        return items.filter(item => new Date(item.created_at) >= startOfDay);
      case 'weekly':
        return items.filter(item => new Date(item.created_at) >= startOfWeek);
      case 'monthly':
        return items.filter(item => new Date(item.created_at) >= startOfMonth);
      case 'all':
        return items;
      default:
        return items;
    }
  };

  const memoizedItems = useMemo(() => items, [items]);
  const filteredItems = filterPurchases();
  const totalSuppliers = filteredItems.length;
  const totalOutstanding = filteredItems.reduce((sum, item) => sum + item.balance, 0);
  const totalPurchases = filteredItems.reduce((sum, item) => sum + item.total_amount, 0);

  const loadMore = () => {
    setPage(p => p + 1);
    fetchPurchases();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-6 border-b bg-card">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl md:text-2xl font-bold">
            {isEnglish ? "Item Purchase Management" : "സാധനം വാങ്ങൽ മാനേജ്മെന്റ്"}
          </h1>
          <Button size="sm" onClick={() => document.getElementById('add-form')?.scrollIntoView()}>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{isEnglish ? "Add Purchase" : "വാങ്ങൽ ചേർക്കുക"}</span>
            <span className="sm:hidden">{isEnglish ? "Add" : "ചേർക്കുക"}</span>
          </Button>
        </div>


        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-blue-600 mb-1">{totalSuppliers}</div>
              <div className="text-xs text-muted-foreground">
                {isEnglish ? "Total Suppliers" : "മൊത്തം വിതരണക്കാർ"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-red-600 mb-1">₹{totalOutstanding.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                {isEnglish ? "Total Outstanding" : "മൊത്തം ബാക്കി"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-green-600 mb-1">₹{totalPurchases.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                {isEnglish ? "Total Purchases" : "മൊത്തം വാങ്ങലുകൾ"}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Purchase Records Table */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {isEnglish ? "Purchase Records" : "വാങ്ങൽ രേഖകൾ"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredItems.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg">
                  {isEnglish ? "No purchases found for this period" : "ഈ കാലയളവിൽ വാങ്ങലുകൾ കണ്ടെത്തിയില്ല"}
                </p>
              </div>
            ) : (
            <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "ID" : "ഐഡി"}
                      </th>
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "Supplier Name" : "വിതരണക്കാരന്റെ പേര്"}
                      </th>
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "Date" : "തീയതി"}
                      </th>
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "Total Amount" : "മൊത്തം തുക"}
                      </th>
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "Amount Given" : "നൽകിയ തുക"}
                      </th>
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "Balance" : "ബാക്കി"}
                      </th>
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "Status" : "സ്ഥിതി"}
                      </th>
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "Actions" : "പ്രവർത്തനങ്ങൾ"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card">
                    {filteredItems.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-muted/50">
                        <td className={`p-3 text-sm font-medium ${!isEnglish ? 'text-right' : ''}`}>
                          {item.transaction_id}
                        </td>
                        <td className={`p-3 text-sm font-medium ${!isEnglish ? 'text-right' : ''} ${isMalayalam(item.supplier_name) ? 'malayalam-text' : ''}`}>
                          {editingId === item.id ? (
                            <Input
                              value={editItem.supplierName}
                              onChange={(e) => setEditItem({...editItem, supplierName: e.target.value})}
                              className="h-8 text-sm"
                            />
                          ) : (
                            item.supplier_name
                          )}
                        </td>
                        <td className={`p-3 text-sm text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>{new Date(item.created_at).toLocaleDateString()}</td>
                        <td className={`p-3 text-sm font-medium ${!isEnglish ? 'text-right' : ''}`}>
                          {editingId === item.id ? (
                            <Input
                              type="text"
                              value={editItem.totalAmount}
                              onChange={e => {
                                let val = e.target.value;
                                const parsed = universalNumberParser(val);
                                if (parsed !== null) val = parsed.toString();
                                setEditItem({...editItem, totalAmount: val});
                              }}
                              className="h-8 text-sm"
                            />
                          ) : (
                            `₹${item.total_amount.toLocaleString()}`
                          )}
                        </td>
                        <td className={`p-3 text-sm font-medium ${!isEnglish ? 'text-right' : ''}`}>
                          {editingId === item.id ? (
                            <Input
                              type="text"
                              value={editItem.amountPaid}
                              onChange={e => {
                                let val = e.target.value;
                                const parsed = universalNumberParser(val);
                                if (parsed !== null) val = parsed.toString();
                                setEditItem({...editItem, amountPaid: val});
                              }}
                              className="h-8 text-sm"
                            />
                          ) : (
                            `₹${item.amount_paid.toLocaleString()}`
                          )}
                        </td>
                        <td className={`p-3 text-sm font-semibold ${!isEnglish ? 'text-right' : ''}`}>
                          <span className={item.balance > 0 ? "text-red-600" : "text-green-600"}>
                            ₹{item.balance.toLocaleString()}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.balance > 0 
                              ? "bg-red-100 text-red-700" 
                              : "bg-green-100 text-green-700"
                          }`}>
                            {item.balance > 0 
                              ? (isEnglish ? "Pending" : "ബാക്കി") 
                              : (isEnglish ? "Cleared" : "തീർത്തു")
                            }
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {editingId === item.id ? (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={saveEdit}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={cancelEdit}
                                  className="text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => startEdit(item)}
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => deleteItem(item.id)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Load More Button */}
        {hasMore && !loading && (
          <div className="flex justify-center mt-4">
            <Button onClick={loadMore} size="sm">{isEnglish ? "Load More" : "കൂടുതൽ കാണിക്കുക"}</Button>
          </div>
        )}

        {/* Add Purchase Form */}
        <Card id="add-form">
          <CardHeader>
            <CardTitle className="text-xl">
              {isEnglish ? "Add New Purchase" : "പുതിയ വാങ്ങൽ ചേർക്കുക"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => {
              e.preventDefault();
              addItem();
            }} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="supplier-name" className="text-sm font-medium">
                  {isEnglish ? "Supplier Name" : "വിതരണക്കാരന്റെ പേര്"}
                </Label>
                <Input
                  id="supplier-name"
                  value={newItem.supplierName}
                  onChange={(e) => setNewItem({ ...newItem, supplierName: e.target.value })}
                  placeholder={isEnglish ? "Enter supplier name" : "വിതരണക്കാരന്റെ പേര് നൽകുക"}
                  className="h-11"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="total-amount" className="text-sm font-medium">
                    {isEnglish ? "Total Amount" : "മൊത്തം തുക"}
                  </Label>
                  <Input
                    id="total-amount"
                    type="text"
                    value={newItem.totalAmount}
                    onChange={e => {
                      let val = e.target.value;
                      const parsed = universalNumberParser(val);
                      if (parsed !== null) val = parsed.toString();
                      setNewItem({ ...newItem, totalAmount: val });
                    }}
                    placeholder="₹0"
                    className="h-11"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="amount-given" className="text-sm font-medium">
                    {isEnglish ? "Amount Given" : "നൽകിയ തുക"}
                  </Label>
                  <Input
                    id="amount-given"
                    type="text"
                    value={newItem.amountPaid}
                    onChange={e => {
                      let val = e.target.value;
                      const parsed = universalNumberParser(val);
                      if (parsed !== null) val = parsed.toString();
                      setNewItem({ ...newItem, amountPaid: val });
                    }}
                    placeholder="₹0"
                    className="h-11"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={isSubmitting} 
                className="w-full h-11 text-base"
              >
                <Plus className="h-5 w-5 mr-2" />
                {isSubmitting ? "Adding..." : (isEnglish ? "Add Purchase" : "വാങ്ങൽ ചേർക്കുക")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ItemPurchase;