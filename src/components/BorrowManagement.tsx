
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit, Check, X } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { universalNumberParser } from "@/services/voiceCommandService";

interface BorrowManagementProps {
  language: string;
  filter?: string;
}

// Define the shape of the borrow data
interface BorrowData {
  name: string;
  totalGiven: string | number;
  amountPaid?: string | number;
}

// Define the shape of the borrow result
interface BorrowResult {
  success: boolean;
  error?: string;
  data?: {
    id: string;
    name: string;
    amount: number;
    paid: number;
    balance: number;
  };
}

// Extend the Window interface to include our custom events
declare global {
  interface WindowEventMap {
    'add-borrow': CustomEvent<BorrowData>;
    'add-borrow-result': CustomEvent<BorrowResult>;
  }
}

interface BorrowItem {
  id: string;
  borrower_name: string;
  created_at: string;
  total_given: number;
  amount_paid: number;
  balance: number;
  transaction_id: string;
}

const PAGE_SIZE = 20;

const BorrowManagement = ({ language, filter = 'monthly' }: BorrowManagementProps) => {
  const [items, setItems] = useState<BorrowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [internalFilter, setInternalFilter] = useState<'daily' | 'weekly' | 'monthly' | 'all'>(typeof filter === 'string' ? (filter as 'daily' | 'weekly' | 'monthly' | 'all') : 'monthly');
const activeFilter = typeof filter === 'string' ? (filter as 'daily' | 'weekly' | 'monthly' | 'all') : internalFilter;

  // Fetch borrows from Supabase
  const fetchBorrows = async (reset = false) => {
    setLoading(true);
    try {
      let query = supabase
        .from('borrows')
        .select('id,borrower_name,created_at,total_given,amount_paid,balance,transaction_id')
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
        description: "Failed to fetch borrows",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchBorrows(true);
    const handleDataUpdated = () => {
      setPage(1);
      fetchBorrows(true);
      toast({ title: 'Data Updated', description: 'Borrow data refreshed.', variant: 'default' });
      console.log('[BorrowManagement] Data updated event received, borrows refreshed.');
    };
    window.addEventListener('data-updated', handleDataUpdated);
    return () => {
      window.removeEventListener('data-updated', handleDataUpdated);
    };
  }, [activeFilter]);

  useEffect(() => {
    const handleDataUpdated = () => {
      fetchBorrows(); // Refresh the data
      toast({
        title: "Success",
        description: "Data updated successfully!",
        variant: "default"
      });
    };
    window.addEventListener('data-updated', handleDataUpdated);
    return () => window.removeEventListener('data-updated', handleDataUpdated);
  }, []);

  const loadMore = () => {
    setPage(p => p + 1);
    fetchBorrows();
  };

  const [newItem, setNewItem] = useState({
    name: "",
    totalGiven: "",
    amountPaid: ""
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<{
    name: string;
    totalGiven: string;
    amountPaid: string;
  }>({
    name: "",
    totalGiven: "",
    amountPaid: ""
  });

  // Helper to detect Malayalam text
  const isMalayalam = (text: string) => /[\u0D00-\u0D7F]/.test(text);

  // Refactor addItem to accept parameters
  const addItem = async (
    nameParam?: string,
    totalGivenParam?: string,
    amountPaidParam?: string
  ) => {
    const name = nameParam ?? newItem.name;
    let totalGivenStr = totalGivenParam ?? newItem.totalGiven;
    let amountPaidStr = amountPaidParam ?? newItem.amountPaid;
    // Convert Malayalam/English number words to digits
    const parsedTotal = universalNumberParser(totalGivenStr);
    if (parsedTotal !== null) totalGivenStr = parsedTotal.toString();
    const parsedPaid = universalNumberParser(amountPaidStr);
    if (parsedPaid !== null) amountPaidStr = parsedPaid.toString();
    console.log('[BorrowManagement] addItem called with:', { name, totalGivenStr, amountPaidStr });
    // Validation
    if (!name.trim()) {
      toast({ title: "Validation Error", description: "Borrower name cannot be empty.", variant: "destructive" });
      return;
    }
    if (!totalGivenStr || isNaN(Number(totalGivenStr)) || Number(totalGivenStr) <= 0) {
      toast({ title: "Validation Error", description: "Amount given must be a positive number.", variant: "destructive" });
      return;
    }
    if (amountPaidStr && (isNaN(Number(amountPaidStr)) || Number(amountPaidStr) < 0)) {
      toast({ title: "Validation Error", description: "Amount paid must be zero or a positive number.", variant: "destructive" });
      return;
    }
    if (!isSubmitting) {
      setIsSubmitting(true);
      const totalGiven = parseFloat(totalGivenStr) || 0;
      const amountPaid = parseFloat(amountPaidStr) || 0;
      const balance = totalGiven - amountPaid;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        const { data, error } = await supabase
          .from('borrows')
          .insert({
            borrower_name: name,
            total_given: totalGiven,
            amount_paid: amountPaid,
            balance: balance,
            user_id: user.id
          })
          .select()
          .single();
        if (error) throw error;
        setItems([...items, data]);
        setNewItem({ name: "", totalGiven: "", amountPaid: "" });
        toast({
          title: "Saved!",
          description: `Borrower: ${name}, Amount: ₹${totalGiven}, Paid: ₹${amountPaid}`,
          variant: "default"
        });
        await fetchBorrows();
        window.dispatchEvent(new CustomEvent('data-updated'));
        window.dispatchEvent(new CustomEvent('add-borrow-result', { detail: { success: true } }));
        console.log('[BorrowManagement] data-updated event fired after DB write.');
      } catch (error: any) {
        console.error('[BorrowManagement] Error adding borrow record:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to add borrow record",
          variant: "destructive",
        });
        window.dispatchEvent(new CustomEvent('add-borrow-result', { detail: { success: false, error: error.message } }));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Handle add-borrow events from VoiceAssistant
  useEffect(() => {
    const handleAddBorrow = async (e: CustomEvent) => {
      try {
        const { name, totalGiven, amountPaid = '' } = e.detail || {};
        
        console.log('[BorrowManagement] Received add-borrow event:', { 
          name, 
          totalGiven, 
          amountPaid 
        });
        
        if (!name || !totalGiven) {
          console.error('[BorrowManagement] Missing required fields in add-borrow event');
          window.dispatchEvent(new CustomEvent('add-borrow-result', { 
            detail: { 
              success: false, 
              error: 'Missing required fields (name and amount are required)' 
            } 
          }));
          return;
        }
        
        // Process the borrow record
        await addItem(name, totalGiven, amountPaid);
        
        console.log('[BorrowManagement] Successfully processed add-borrow event');
        
      } catch (error: any) {
        console.error('[BorrowManagement] Error handling add-borrow event:', error);
        
        // Make sure to notify about the error
        window.dispatchEvent(new CustomEvent('add-borrow-result', { 
          detail: { 
            success: false, 
            error: error.message || 'Failed to process borrow record' 
          } 
        }));
      }
    };
    
    // Add the event listener
    window.addEventListener('add-borrow', handleAddBorrow as EventListener);
    
    // Clean up the event listener
    return () => {
      window.removeEventListener('add-borrow', handleAddBorrow as EventListener);
    };
  }, [addItem]); // Include addItem in the dependency array

  const isEnglish = language === "english";

  const deleteItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('borrows')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setItems(items.filter(item => item.id !== id));
      toast({
        title: "Success",
        description: "Borrow record deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete borrow record",
        variant: "destructive",
      });
    }
  };

  const startEdit = (item: BorrowItem) => {
    setEditingId(item.id);
    setEditItem({
      name: item.borrower_name,
      totalGiven: item.total_given.toString(),
      amountPaid: item.amount_paid.toString()
    });
  };

  const saveEdit = async () => {
    if (editingId && editItem.name && editItem.totalGiven) {
      const totalGiven = parseFloat(editItem.totalGiven) || 0;
      const amountPaid = parseFloat(editItem.amountPaid) || 0;
      const balance = totalGiven - amountPaid;

      try {
        const { error } = await supabase
          .from('borrows')
          .update({
            borrower_name: editItem.name,
            total_given: totalGiven,
            amount_paid: amountPaid,
            balance: balance
          })
          .eq('id', editingId);

        if (error) throw error;

        setItems(items.map(item => 
          item.id === editingId 
            ? { ...item, borrower_name: editItem.name, total_given: totalGiven, amount_paid: amountPaid, balance }
            : item
        ));
        setEditingId(null);
        setEditItem({ name: "", totalGiven: "", amountPaid: "" });
        toast({
          title: "Success",
          description: "Borrow record updated successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to update borrow record",
          variant: "destructive",
        });
      }
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditItem({ name: "", totalGiven: "", amountPaid: "" });
  };

  // Filter borrows based on time period
  const filterBorrows = () => {
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
  const filteredItems = filterBorrows();
  const totalBorrowers = filteredItems.length;
  const totalOutstanding = filteredItems.reduce((sum, item) => sum + item.balance, 0);
  const totalGiven = filteredItems.reduce((sum, item) => sum + item.total_given, 0);

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
            {isEnglish ? "Borrow Management" : "കടം മാനേജ്മെന്റ്"}
          </h1>
          <Button size="sm" onClick={() => document.getElementById('add-form')?.scrollIntoView()}>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{isEnglish ? "Add Record" : "രേഖ ചേർക്കുക"}</span>
            <span className="sm:hidden">{isEnglish ? "Add" : "ചേർക്കുക"}</span>
          </Button>
        </div>


        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-blue-600 mb-1">{totalBorrowers}</div>
              <div className="text-xs text-muted-foreground">
                {isEnglish ? "Total Borrowers" : "മൊത്തം കടക്കാർ"}
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
              <div className="text-xl font-bold text-green-600 mb-1">₹{totalGiven.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                {isEnglish ? "Total Given" : "മൊത്തം നൽകിയത്"}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Borrow Records Table */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {isEnglish ? "Borrow Records" : "കടം രേഖകൾ"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredItems.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg">
                  {isEnglish ? "No borrow records found for this period" : "ഈ കാലയളവിൽ കടം രേഖകൾ കണ്ടെത്തിയില്ല"}
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
                        {isEnglish ? "Borrower Name" : "കടക്കാരന്റെ പേര്"}
                      </th>
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "Date" : "തീയതി"}
                      </th>
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "Amount Given" : "നൽകിയ തുക"}
                      </th>
                      <th className={`text-left p-3 text-sm font-medium text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>
                        {isEnglish ? "Amount Received" : "തിരികെ കിട്ടിയത്"}
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
                        <td className={`p-3 text-sm font-medium ${!isEnglish ? 'text-right' : ''}`}>{item.transaction_id}</td>
                        <td className={`p-3 text-sm font-medium ${!isEnglish ? 'text-right' : ''} ${isMalayalam(item.borrower_name) ? 'malayalam-text' : ''}`}>
                          {editingId === item.id ? (
                            <Input
                              value={editItem.name}
                              onChange={(e) => setEditItem({...editItem, name: e.target.value})}
                              className="h-8 text-sm"
                            />
                          ) : (
                            item.borrower_name
                          )}
                        </td>
                        <td className={`p-3 text-sm text-muted-foreground ${!isEnglish ? 'text-right' : ''}`}>{new Date(item.created_at).toLocaleDateString()}</td>
                        <td className={`p-3 text-sm font-medium ${!isEnglish ? 'text-right' : ''}`}>
                          {editingId === item.id ? (
                            <Input
                              type="text"
                              value={editItem.totalGiven}
                              onChange={e => {
                                let val = e.target.value;
                                const parsed = universalNumberParser(val);
                                if (parsed !== null) val = parsed.toString();
                                setEditItem({...editItem, totalGiven: val});
                              }}
                              className="h-8 text-sm"
                            />
                          ) : (
                            `₹${item.total_given.toLocaleString()}`
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

        {/* Add Borrow Form */}
        <Card id="add-form">
          <CardHeader>
            <CardTitle className="text-xl">
              {isEnglish ? "Add New Borrow Record" : "പുതിയ കടം രേഖ ചേർക്കുക"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="borrower-name" className="text-sm font-medium">
                {isEnglish ? "Borrower Name" : "കടക്കാരന്റെ പേര്"}
              </Label>
              <Input
                id="borrower-name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder={isEnglish ? "Enter borrower name" : "കടക്കാരന്റെ പേര് നൽകുക"}
                className="h-11"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="total-given" className="text-sm font-medium">
                  {isEnglish ? "Amount Given" : "നൽകിയ തുക"}
                </Label>
                <Input
                  id="total-given"
                  type="text"
                  value={newItem.totalGiven}
                  onChange={e => {
                    let val = e.target.value;
                    const parsed = universalNumberParser(val);
                    if (parsed !== null) val = parsed.toString();
                    setNewItem({ ...newItem, totalGiven: val });
                  }}
                  placeholder="₹0"
                  className="h-11"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="amount-paid" className="text-sm font-medium">
                  {isEnglish ? "Amount Received" : "തിരികെ കിട്ടിയത്"}
                </Label>
                <Input
                  id="amount-paid"
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
                />
              </div>
            </div>

            <Button onClick={() => addItem()} disabled={isSubmitting} className="w-full h-11 text-base">
              <Plus className="h-5 w-5 mr-2" />
              {isSubmitting ? "Adding..." : (isEnglish ? "Add Borrow Record" : "കടം രേഖ ചേർക്കുക")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BorrowManagement;
