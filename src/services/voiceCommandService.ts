import { supabase } from "@/integrations/supabase/client";
import nlp from 'compromise';
import Fuse from 'fuse.js';

export interface VoiceCommandResult {
  success: boolean;
  message: string;
  summary?: string; // concise summary for TTS
  debug?: string;   // debug info for UI
  type?: 'income' | 'expense' | 'purchase' | 'borrow'; // Added for event dispatch
  amount?: number; // Added for event dispatch
  category?: string; // Added for event dispatch
  description?: string; // Added for event dispatch
}

// --- Expanded Malayalam Number Map and Parser ---
const malayalamNumberMap: Record<string, number> = {
  // Units
  "പൂജ്യം": 0, "ഒന്ന്": 1, "രണ്ട്": 2, "മൂന്ന്": 3, "നാല്": 4, "അഞ്ച്": 5, "ആറ്": 6, "ഏഴ്": 7, "എട്ട്": 8, "ഒമ്പത്": 9,
  // Alternative forms
  "ഒരു": 1, "ഒന്നു": 1, "രണ്ടു": 2, "മൂന്നു": 3, "നാലു": 4, "അഞ്ചു": 5, "ആറു": 6, "ഏഴു": 7, "എട്ടു": 8, "ഒമ്പതു": 9,
  // 10-19
  "പത്ത്": 10, "പതിനൊന്ന്": 11, "പന്ത്രണ്ട്": 12, "പതിമൂന്ന്": 13, "പതിനാല്": 14, "പതിനഞ്ച്": 15, "പതിനാറ്": 16, "പതിനേഴ്": 17, "പതിനെട്ട്": 18, "പത്തൊമ്പത്": 19,
  // Alternative forms for 10-19
  "പതിനൊന്നു": 11, "പന്ത്രണ്ടു": 12, "പതിമൂന്നു": 13, "പതിനാലു": 14, "പതിനഞ്ചു": 15, "പതിനാറു": 16, "പതിനേഴു": 17, "പതിനെട്ടു": 18, "പത്തൊമ്പതു": 19,
  // Tens
  "ഇരുപത്": 20, "മുപ്പത്": 30, "നാല്പത്": 40, "അമ്പത്": 50, "അറുപത്": 60, "എഴുപത്": 70, "എൺപത്": 80, "തൊണ്ണൂറ്": 90,
  // Alternative forms for tens
  "ഇരുപതു": 20, "മുപ്പതു": 30, "നാല്പതു": 40, "അമ്പതു": 50, "അറുപതു": 60, "എഴുപതു": 70, "എൺപതു": 80, "തൊണ്ണൂറു": 90,
  // Hundreds
  "നൂറ്": 100, "രണ്ടുനൂറ്": 200, "മുന്നൂറ്": 300, "നാനൂറ്": 400, "അഞ്ഞൂറ്": 500, "അറുനൂറ്": 600, "എഴുനൂറ്": 700, "എണ്ണൂറ്": 800, "തൊള്ളായിരം": 900,
  // Alternative forms for hundreds
  "നൂറു": 100, "രണ്ടുനൂറു": 200, "മുന്നൂറു": 300, "നാനൂറു": 400, "അഞ്ഞൂറു": 500, "അറുനൂറു": 600, "എഴുനൂറു": 700, "എണ്ണൂറു": 800,
  // Thousands
  "ആയിരം": 1000, "രണ്ടായിരം": 2000, "മുന്നായിരം": 3000, "നാലായിരം": 4000, "അയ്യായിരം": 5000, "അറായിരം": 6000, "ഏഴായിരം": 7000, "എട്ടായിരം": 8000, "ഒമ്പതായിരം": 9000,
  // Alternative forms for thousands
  "ആയിരു": 1000, "രണ്ടായിരു": 2000, "മുന്നായിരു": 3000, "നാലായിരു": 4000, "അയ്യായിരു": 5000, "അറായിരു": 6000, "ഏഴായിരു": 7000, "എട്ടായിരു": 8000, "ഒമ്പതായിരു": 9000,
  // Ten thousands
  "പത്തായിരം": 10000, "ഇരുപത്തായിരം": 20000, "മുപ്പത്തായിരം": 30000, "നാല്പത്തായിരം": 40000, "അമ്പത്തായിരം": 50000, "അറുപത്തായിരം": 60000, "എഴുപത്തായിരം": 70000, "എൺപത്തായിരം": 80000, "തൊണ്ണൂറായിരം": 90000,
  // Alternative forms for ten thousands
  "പത്തായിരു": 10000, "ഇരുപത്തായിരു": 20000, "മുപ്പത്തായിരു": 30000, "നാല്പത്തായിരു": 40000, "അമ്പത്തായിരു": 50000, "അറുപത്തായിരു": 60000, "എഴുപത്തായിരു": 70000, "എൺപത്തായിരു": 80000, "തൊണ്ണൂറായിരു": 90000,
  // Lakhs
  "ലക്ഷം": 100000, "രണ്ടുലക്ഷം": 200000, "മുന്നുലക്ഷം": 300000, "നാലുലക്ഷം": 400000, "അയ്യുലക്ഷം": 500000, "അറുലക്ഷം": 600000, "ഏഴുലക്ഷം": 700000, "എട്ടുലക്ഷം": 800000, "ഒമ്പതുലക്ഷം": 900000,
  // Alternative forms for lakhs
  "ലക്ഷു": 100000, "രണ്ടുലക്ഷു": 200000, "മുന്നുലക്ഷു": 300000, "നാലുലക്ഷു": 400000, "അയ്യുലക്ഷു": 500000, "അറുലക്ഷു": 600000, "ഏഴുലക്ഷു": 700000, "എട്ടുലക്ഷു": 800000, "ഒമ്പതുലക്ഷു": 900000,
  // Ten lakhs
  "പത്ത് ലക്ഷം": 1000000, "ഇരുപത് ലക്ഷം": 2000000, "മുപ്പത് ലക്ഷം": 3000000, "നാല്പത് ലക്ഷം": 4000000, "അമ്പത് ലക്ഷം": 5000000, "അറുപത് ലക്ഷം": 6000000, "എഴുപത് ലക്ഷം": 7000000, "എൺപത് ലക്ഷം": 8000000, "തൊണ്ണൂറ് ലക്ഷം": 9000000,
  // Alternative forms for ten lakhs
  "പത്തു ലക്ഷം": 1000000, "ഇരുപതു ലക്ഷം": 2000000, "മുപ്പതു ലക്ഷം": 3000000, "നാല്പതു ലക്ഷം": 4000000, "അമ്പതു ലക്ഷം": 5000000, "അറുപതു ലക്ഷം": 6000000, "എഴുപതു ലക്ഷം": 7000000, "എൺപതു ലക്ഷം": 8000000, "തൊണ്ണൂറു ലക്ഷം": 9000000,
  // Crores
  "കോടി": 10000000, "രണ്ടുകോടി": 20000000, "മുന്നുകോടി": 30000000, "നാലുകോടി": 40000000, "അയ്യുകോടി": 50000000, "അറുകോടി": 60000000, "ഏഴുകോടി": 70000000, "എട്ടുകോടി": 80000000, "ഒമ്പതുകോടി": 90000000,
  // Alternative forms for crores
  "കോടിയ": 10000000, "രണ്ടുകോടിയ": 20000000, "മുന്നുകോടിയ": 30000000, "നാലുകോടിയ": 40000000, "അയ്യുകോടിയ": 50000000, "അറുകോടിയ": 60000000, "ഏഴുകോടിയ": 70000000, "എട്ടുകോടിയ": 80000000, "ഒമ്പതുകോടിയ": 90000000,
  // Common spoken forms
  "ആയിരം രൂപ": 1000, "ലക്ഷം രൂപ": 100000, "കോടി രൂപ": 10000000,
  "ആയിരം രൂപയ്ക്ക്": 1000, "ലക്ഷം രൂപയ്ക്ക്": 100000, "കോടി രൂപയ്ക്ക്": 10000000,
  // Common expense/borrow phrases
  "ആയിരം ചെലവ്": 1000, "ലക്ഷം ചെലവ്": 100000, "കോടി ചെലവ്": 10000000,
  "ആയിരം കടം": 1000, "ലക്ഷം കടം": 100000, "കോടി കടം": 10000000,
  "ആയിരം വാങ്ങൽ": 1000, "ലക്ഷം വാങ്ങൽ": 100000, "കോടി വാങ്ങൽ": 10000000,
  // Spoken forms
  "oru ayiram": 1000, "oru lakh": 100000, "oru kodi": 10000000, "pathu lakh": 1000000, "pathu kodi": 100000000,
  // Shopkeeper phrases
  "പുതിയ വരുമാനം": 0, "പോയത്": 0, "പുതിയ ചെലവ്": 0, "പുതിയ വാങ്ങൽ": 0, "പുതിയ കടം": 0
};

function parseMalayalamCompoundNumber(phrase: string): number | null {
  console.log('[parseMalayalamCompoundNumber] Processing phrase:', phrase);
  
  // Try direct match
  if (malayalamNumberMap[phrase]) {
    console.log('[parseMalayalamCompoundNumber] Direct match found:', malayalamNumberMap[phrase]);
    return malayalamNumberMap[phrase];
  }
  
  // Try digit
  if (/^\d+$/.test(phrase)) {
    console.log('[parseMalayalamCompoundNumber] Digit match found:', parseInt(phrase, 10));
    return parseInt(phrase, 10);
  }
  
  // Try compound (e.g., "രണ്ടു ലക്ഷം")
  let total = 0, current = 0;
  const words = phrase.split(' ');
  console.log('[parseMalayalamCompoundNumber] Words to process:', words);
  
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    let val = malayalamNumberMap[w];
    
    if (!val && i + 1 < words.length) {
      const compound = w + ' ' + words[i + 1];
      val = malayalamNumberMap[compound];
      if (val) {
        console.log('[parseMalayalamCompoundNumber] Compound match found:', compound, val);
        i++;
      }
    }
    
    if (val) {
      console.log('[parseMalayalamCompoundNumber] Processing word:', w, 'value:', val);
      if ([100, 1000, 10000, 100000, 1000000, 10000000, 100000000].includes(val)) {
        if (current === 0) current = 1;
        current *= val;
        total += current;
        current = 0;
      } else {
        current += val;
      }
    }
  }
  total += current;
  
  console.log('[parseMalayalamCompoundNumber] Final result:', total > 0 ? total : null);
  return total > 0 ? total : null;
}

const englishNumberMap: Record<string, number> = {
  "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "hundred": 100, "thousand": 1000, "lakh": 100000, "lac": 100000, "ten lakh": 1000000, "crore": 10000000, "one crore": 10000000
};
const malayalamScales = ["കോടി", "ലക്ഷം", "ആയിരം", "നൂറ്"];
const englishScales = ["crore", "lakh", "lac", "thousand", "hundred"];

export function universalNumberParser(phrase: string): number | null {
  phrase = phrase.toLowerCase().replace(/[,-]/g, ' ').replace(/\s+/g, ' ').trim();
  
  console.log('[universalNumberParser] Processing phrase:', phrase);
  
  // 0. Try to extract number from common phrases like "1000 rupees" or "ആയിരം രൂപ"
  const rupeeMatch = phrase.match(/(\d+)\s*(?:rupees?|രൂപ|രൂപയ്ക്ക്?)/i);
  if (rupeeMatch) {
    console.log('[universalNumberParser] Found rupee phrase match:', rupeeMatch[1]);
    return parseInt(rupeeMatch[1], 10);
  }
  
  // 1. Try digit match
  const digitMatch = phrase.match(/\b\d{1,8}\b/);
  if (digitMatch) {
    console.log('[universalNumberParser] Found digit match:', digitMatch[0]);
    return parseInt(digitMatch[0], 10);
  }
  
  // 2. Try Malayalam compound
  const mlNum = parseMalayalamCompoundNumber(phrase);
  if (mlNum !== null) {
    console.log('[universalNumberParser] Found Malayalam number:', mlNum);
    return mlNum;
  }
  
  // 3. Try English word/compound (existing logic)
  for (const [word, value] of Object.entries(englishNumberMap)) {
    if (phrase.includes(word)) {
      console.log('[universalNumberParser] Found English word match:', word, value);
      return value;
    }
  }
  
  // 4. Try compound parsing (existing logic)
  let total = 0, current = 0;
  const words = phrase.split(' ');
  console.log('[universalNumberParser] Words to process:', words);
  
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    let val = malayalamNumberMap[w] || englishNumberMap[w];
    
    if (!val && i + 1 < words.length) {
      const compound = w + ' ' + words[i + 1];
      val = malayalamNumberMap[compound] || englishNumberMap[compound];
      if (val) {
        console.log('[universalNumberParser] Found compound match:', compound, val);
        i++;
      }
    }
    
    if (val) {
      console.log('[universalNumberParser] Processing word:', w, 'value:', val);
      if ([100, 1000, 10000, 100000, 1000000, 10000000, 100000000].includes(val)) {
        if (current === 0) current = 1;
        current *= val;
        total += current;
        current = 0;
      } else {
        current += val;
      }
    }
  }
  total += current;
  
  console.log('[universalNumberParser] Final result:', total > 0 ? total : null);
  return total > 0 ? total : null;
}

// Example supplier list for fuzzy matching
const supplierList = [
  'ABC Traders', 'XYZ Suppliers', 'Mohan Stores', 'Sahai Distributors', 'Global Mart', 'Super Bazaar', 'Fresh Mart', 'Elite Suppliers', 'Prime Wholesale', 'Classic Traders'
];
const fuse = new Fuse(supplierList, { includeScore: true, threshold: 0.4 });

// Add a list of common Malayalam supplier/borrower names for fuzzy matching
const malayalamNameList = [
  'രാജു', 'ബിനു', 'സുനിൽ', 'അനിൽ', 'ഷാജി', 'മനോജ്', 'സജീവ്', 'ബാബു', 'സുരേഷ്', 'വിനോദ്',
  'കൃഷ്ണൻ', 'മുരളി', 'ജയൻ', 'സന്തോഷ്', 'പ്രദീപ്', 'അജിത്', 'ബാലു', 'രമേശ്', 'സജു', 'വിജയ്',
  'അമൽ', 'അരുൺ', 'അനൂപ്', 'അനീഷ്', 'അനിൽകുമാർ', 'ബാലകൃഷ്ണൻ', 'ദിലീപ്', 'ഗിരീഷ്', 'ഹരീഷ്', 'ഇന്ദ്രജിത്',
  'ജയകുമാർ', 'ജയശങ്കർ', 'ജയചന്ദ്രൻ', 'ജയപ്രകാശ്', 'ജയരാജ്', 'ജയശ്രീ', 'ജയശ്രീ', 'ജയശ്രീ', 'ജയശ്രീ', 'ജയശ്രീ'
];
const malayalamFuse = new Fuse(malayalamNameList, { includeScore: true, threshold: 0.4 });

// Move cleanForNameExtraction above its first use
function cleanForNameExtraction(text: string, language: string): string {
  // Remove numbers and number words
  let cleaned = text.replace(/\d+/g, ' ');
  if (language === 'english') {
    cleaned = cleaned.replace(/zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|lac|crore/gi, ' ');
    cleaned = cleaned.replace(/purchase|from|rupees|rs|amount|paid|for|add|supplier|buy/gi, ' ');
  } else {
    cleaned = cleaned.replace(/ഒന്ന്|രണ്ട്|മൂന്ന്|നാല്|അഞ്ച്|ആറ്|ഏഴ്|എട്ട്|ഒമ്പത്|പത്ത്|പതിനൊന്ന്|പന്ത്രണ്ട്|പതിമൂന്ന്|പതിനാല്|പതിനഞ്ച്|പതിനാറ്|പതിനേഴ്|പതിനെട്ട്|പത്തൊമ്പത്|ഇരുപത്|മുപ്പത്|നാല്പത്|അമ്പത്|അറുപത്|എഴുപത്|എൺപത്|തൊണ്ണൂറ്|നൂറ്|രണ്ടുനൂറ്|മുന്നൂറ്|നാനൂറ്|അഞ്ഞൂറ്|അറുനൂറ്|എഴുനൂറ്|എണ്ണൂറ്|തൊള്ളായിരം|ആയിരം|രണ്ടായിരം|മുന്നായിരം|നാലായിരം|അയ്യായിരം|അറായിരം|ഏഴായിരം|എട്ടായിരം|ഒമ്പതായിരം|പത്തായിരം|ഇരുപത്തായിരം|മുപ്പത്തായിരം|നാല്പത്തായിരം|അമ്പത്തായിരം|അറുപത്തായിരം|എഴുപത്തായിരം|എൺപത്തായിരം|തൊണ്ണൂറായിരം|ലക്ഷം|രണ്ടുലക്ഷം|മുന്നുലക്ഷം|നാലുലക്ഷം|അയ്യുലക്ഷം|അറുലക്ഷം|ഏഴുലക്ഷം|എട്ടുലക്ഷം|ഒമ്പതുലക്ഷം|പത്തുലക്ഷം/g, ' ');
    cleaned = cleaned.replace(/വാങ്ങൽ|നിന്ന്|ൽ|രൂപ|rs|rupees|ചെലവ്|വിതരണക്കാരൻ|വിതരണക്കാരി|വിതരണക്കാർ|വിതരണക്കാർക്ക്/g, ' ');
  }
  return cleaned.replace(/\s{2,}/g, ' ').trim();
}

export class VoiceCommandService {
  static async processCommand(command: string, language: string): Promise<VoiceCommandResult> {
    const lowerCommand = command.toLowerCase();
    const isEnglish = language === "english";
    
    try {
      let amount: number | null = null;
      let amountText: string | null = null;
      amount = universalNumberParser(lowerCommand);
      if (amount !== null) {
        amountText = amount.toString();
      }
      
      // Debug logging
      console.log('[VoiceCommandService] Processing command:', {
        original: command,
        lower: lowerCommand,
        amount: amount,
        amountText: amountText,
        language: language
      });
      
      // Remove amount text from command for name extraction
      let commandWithoutAmount = lowerCommand;
      if (amountText) {
        commandWithoutAmount = commandWithoutAmount.replace(amountText, '').replace(/\s{2,}/g, ' ').trim();
      }
      
      // Pass commandWithoutAmount to handlers for name extraction
      // Income/Expense handlers don't use name, so pass original command
      if (lowerCommand.includes("income") || lowerCommand.includes("വരുമാനം") || lowerCommand.includes("വരുമാന")) {
        console.log('[VoiceCommandService] Detected income command');
        return await this.handleIncomeCommand(command, amount, lowerCommand, isEnglish, amountText);
      } else if (lowerCommand.includes("expense") || lowerCommand.includes("ചെലവ്") || lowerCommand.includes("ചെലവ") || lowerCommand.includes("ചിലവ്") || lowerCommand.includes("ചിലവ")) {
        console.log('[VoiceCommandService] Detected expense command');
        return await this.handleExpenseCommand(command, amount, lowerCommand, isEnglish, amountText);
      } else if (lowerCommand.includes("purchase") || lowerCommand.includes("വാങ്ങൽ") || lowerCommand.includes("വാങ്ങല്") || lowerCommand.includes("വാങ്ങി")) {
        console.log('[VoiceCommandService] Detected purchase command');
        return await this.handlePurchaseCommand(command, amount, commandWithoutAmount, isEnglish, amountText);
      } else if (lowerCommand.includes("borrow") || lowerCommand.includes("കടം") || lowerCommand.includes("കട") || lowerCommand.includes("കടമെടുത്തു") || lowerCommand.includes("കടംകൊടുത്തു")) {
        console.log('[VoiceCommandService] Detected borrow command');
        return await this.handleBorrowCommand(command, amount, commandWithoutAmount, isEnglish, amountText);
      } else {
        console.log('[VoiceCommandService] No specific command detected, showing help');
        return {
          success: true,
          message: isEnglish 
            ? "I can help you add income, expenses, purchases, and borrowing. Try commands like 'Add income 500' or 'Expense 200 for food'."
            : "വരുമാനം, ചെലവുകൾ, വാങ്ങലുകൾ, കടം എന്നിവ ചേർക്കാൻ ഞാൻ സഹായിക്കാം. '500 വരുമാനം ചേർക്കുക' അല്ലെങ്കിൽ 'ഭക്ഷണത്തിന് 200 ചെലവ്' പോലെ പറയുക.",
          summary: isEnglish ? "Try a command like 'Add income 500'." : "'500 വരുമാനം ചേർക്കുക' എന്ന് ശ്രമിക്കുക."
        };
      }
    } catch (error) {
      console.error('Error processing voice command:', error);
      return {
        success: false,
        message: isEnglish 
          ? "Sorry, there was an error processing your request. Please try again."
          : "ക്ഷമിക്കണം, നിങ്ങളുടെ അഭ്യർത്ഥന പ്രോസസ്സ് ചെയ്യുന്നതിൽ പിശക്. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
        summary: isEnglish ? "Error processing request." : "അഭ്യർത്ഥനയിൽ പിശക്." 
      };
    }
  }

  private static async handleIncomeCommand(command: string, amount: number | null, lowerCommand: string, isEnglish: boolean, amountText?: string): Promise<VoiceCommandResult> {
    if (amount) {
      const category = lowerCommand.includes("sales") || lowerCommand.includes("വിൽപന") ? (isEnglish ? "Sales" : "വിൽപന") :
                      lowerCommand.includes("service") || lowerCommand.includes("സേവനം") ? (isEnglish ? "Service" : "സേവനം") :
                      lowerCommand.includes("investment") || lowerCommand.includes("നിക്ഷേപം") ? (isEnglish ? "Investment" : "നിക്ഷേപം") :
                      (isEnglish ? "Other" : "മറ്റുള്ളവ");
      
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          type: 'income',
          amount: amount,
          category: category,
          description: `Added via voice: ${command}`,
          user_id: (await supabase.auth.getUser()).data.user?.id || ''
        });

      if (error) throw error;
      
      return {
        success: true,
        message: isEnglish 
          ? `Successfully added income of ₹${amount} in ${category} category.`
          : `₹${amount} വരുമാനം ${category} വിഭാഗത്തിൽ വിജയകരമായി ചേർത്തു.`,
        summary: isEnglish ? `Income: ₹${amount} (${category})` : `വരുമാനം: ₹${amount} (${category})`,
        type: 'income',
        amount,
        category,
        description: `Added via voice: ${command}`
      };
    } else {
      amountText = amountText || '';
      return {
        success: false,
        message: isEnglish 
          ? "Could not recognize the amount. Please say the number clearly or enter it manually."
          : "തുക തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല. ദയവായി തുക വ്യക്തമായി പറയുക അല്ലെങ്കിൽ കൈമാറുക.",
        summary: isEnglish ? "Amount not recognized." : "തുക തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല.",
        debug: `transcript: ${command}, extracted amount: ${amountText}`
      };
    }
  }

  private static async handleExpenseCommand(command: string, amount: number | null, lowerCommand: string, isEnglish: boolean, amountText?: string): Promise<VoiceCommandResult> {
    if (amount) {
      const category = lowerCommand.includes("travel") || lowerCommand.includes("യാത്ര") ? (isEnglish ? "Travel" : "യാത്ര") :
                      lowerCommand.includes("food") || lowerCommand.includes("ഭക്ഷണം") ? (isEnglish ? "Food" : "ഭക്ഷണം") :
                      lowerCommand.includes("utilities") || lowerCommand.includes("യൂട്ടിലിറ്റി") ? (isEnglish ? "Utilities" : "യൂട്ടിലിറ്റി") :
                      lowerCommand.includes("supplies") || lowerCommand.includes("സാധനങ്ങൾ") ? (isEnglish ? "Supplies" : "സാധനങ്ങൾ") :
                      (isEnglish ? "Other" : "മറ്റുള്ളവ");
      
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          type: 'expense',
          amount: amount,
          category: category,
          description: `Added via voice: ${command}`,
          user_id: (await supabase.auth.getUser()).data.user?.id || ''
        });

      if (error) throw error;
      
      return {
        success: true,
        message: isEnglish 
          ? `Successfully added expense of ₹${amount} in ${category} category.`
          : `₹${amount} ചെലവ് ${category} വിഭാഗത്തിൽ വിജയകരമായി ചേർത്തു.`,
        summary: isEnglish ? `Expense: ₹${amount} (${category})` : `ചെലവ്: ₹${amount} (${category})`,
        type: 'expense',
        amount,
        category,
        description: `Added via voice: ${command}`
      };
    } else {
      amountText = amountText || '';
      return {
        success: false,
        message: isEnglish 
          ? "Could not recognize the amount. Please say the number clearly or enter it manually."
          : "തുക തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല. ദയവായി തുക വ്യക്തമായി പറയുക അല്ലെങ്കിൽ കൈയാൽ നൽകുക.",
        summary: isEnglish ? "Amount not recognized." : "തുക തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല.",
        debug: `transcript: ${command}, extracted amount: ${amountText}`
      };
    }
  }

  private static async handlePurchaseCommand(command: string, amount: number | null, lowerCommand: string, isEnglish: boolean, amountText?: string): Promise<VoiceCommandResult> {
    if (!amount || isNaN(amount)) {
      return {
        success: false,
        message: isEnglish 
          ? "Amount not recognized. Please say the amount clearly or enter it manually."
          : "തുക തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല. ദയവായി തുക വ്യക്തമായി പറയുക അല്ലെങ്കിൽ കൈയാൽ നൽകുക.",
        summary: isEnglish ? "Amount not recognized." : "തുക തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല.",
        debug: `transcript: ${command}, extracted amount: ${amountText}`
      };
    }
    let supplierName = isEnglish ? "Unknown Supplier" : "അജ്ഞാത വിതരണക്കാരൻ";
    // Define commandWithoutAmount for name extraction
    let commandWithoutAmount = lowerCommand;
    if (amountText) {
      commandWithoutAmount = commandWithoutAmount.replace(amountText, '').replace(/\s{2,}/g, ' ').trim();
    }
    // In handlePurchaseCommand, after removing amountText, use cleanForNameExtraction for supplier name
    const cleanedForName = cleanForNameExtraction(commandWithoutAmount, isEnglish ? 'english' : 'malayalam');
    if (cleanedForName) {
      supplierName = cleanedForName;
    }
    // Fuzzy match against supplier list
    if (supplierName === "Unknown Supplier" || !supplierName.trim()) {
      const fuzzy = fuse.search(command);
      if (fuzzy.length > 0 && fuzzy[0].score !== undefined && fuzzy[0].score < 0.4) {
        supplierName = fuzzy[0].item;
      }
    }
    // If still not found, use the whole transcript as supplier name
    if (!supplierName || supplierName === "Unknown Supplier" || supplierName.trim() === "") {
      supplierName = command.trim();
    }
    let fromMatch = lowerCommand.match(/from\s+([\w\s]+)/i);
    if (!fromMatch && !isEnglish) {
      fromMatch = lowerCommand.match(/([\w\s]+)(ൽ നിന്ന്|നിന്ന്)/i);
    }
    if (!fromMatch) {
      const words = lowerCommand.split(' ');
      const filtered = words.filter(w => isNaN(Number(w)) && !['purchase','വാങ്ങൽ','from','ൽ','നിന്ന്','രൂപ','rs','rupees'].includes(w));
      if (filtered.length > 0) {
        supplierName = filtered.slice(-3).join(' ');
      }
      if ((!supplierName || supplierName === "Unknown Supplier" || supplierName.trim() === "") && filtered.length > 0) {
        supplierName = filtered[0];
      }
    } else {
      supplierName = fromMatch[1].replace(/(രൂപ|rs|rupees)/g, '').trim();
    }
    // Fuzzy match fallback
    if (!supplierName || supplierName === "Unknown Supplier" || supplierName.trim() === "") {
      const fuzzy = fuse.search(command);
      if (fuzzy.length > 0 && fuzzy[0].score !== undefined && fuzzy[0].score < 0.4) {
        supplierName = fuzzy[0].item;
      }
    }
    // If still not found, use the whole transcript as supplier name
    if (!supplierName || supplierName === "Unknown Supplier" || supplierName.trim() === "") {
      supplierName = command.trim();
    }
    if (!isEnglish) {
      // Try Malayalam-specific patterns
      let mlMatch = lowerCommand.match(/([\S]+)ൽ നിന്ന്/);
      if (!mlMatch) mlMatch = lowerCommand.match(/([\S]+) നിന്നു?/);
      if (!mlMatch) mlMatch = lowerCommand.match(/([\S]+) വിതരണക്കാരൻ/);
      if (mlMatch && mlMatch[1]) {
        supplierName = mlMatch[1].trim();
      }
      // Fuzzy match against Malayalam name list
      if (!supplierName || supplierName === "അജ്ഞാത വിതരണക്കാരൻ" || supplierName.trim() === "") {
        const fuzzy = malayalamFuse.search(command);
        if (fuzzy.length > 0 && fuzzy[0].score !== undefined && fuzzy[0].score < 0.4) {
          supplierName = fuzzy[0].item;
        }
      }
    }
    // Fallback: use last few non-number words
    if (!supplierName || supplierName === "Unknown Supplier" || supplierName === "അജ്ഞാത വിതരണക്കാരൻ" || supplierName.trim() === "") {
      const words = lowerCommand.split(' ');
      const filtered = words.filter(w => isNaN(Number(w)) && !['purchase','വാങ്ങൽ','from','ൽ','നിന്ന്','രൂപ','rs','rupees','വിതരണക്കാരൻ'].includes(w));
      if (filtered.length > 0) {
        supplierName = filtered.slice(-3).join(' ');
      }
      if ((!supplierName || supplierName === "Unknown Supplier" || supplierName === "അജ്ഞാത വിതരണക്കാരൻ" || supplierName.trim() === "") && filtered.length > 0) {
        supplierName = filtered[0];
      }
    }
    // Block saving and show warning if name is blank, 'അജ്ഞാത', or suspicious
    if (!supplierName || supplierName === "Unknown Supplier" || supplierName === "അജ്ഞാത വിതരണക്കാരൻ" || supplierName.trim() === "" || /unknown|blank|supplier|person|അജ്ഞാത/i.test(supplierName)) {
      return {
        success: false,
        message: isEnglish 
          ? "Supplier name not recognized. Please say the supplier name clearly or enter it manually."
          : "വിതരണക്കാരന്റെ പേര് തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല. ദയവായി പേര് വ്യക്തമായി പറയുക അല്ലെങ്കിൽ കൈമാറുക.",
        summary: isEnglish ? "Supplier name not recognized." : "വിതരണക്കാരന്റെ പേര് തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല.",
        debug: `transcript: ${command}, extracted supplier: ${supplierName}`
      };
    }

    const { data, error } = await supabase
      .from('purchases')
      .insert({
        supplier_name: supplierName,
        total_amount: amount,
        amount_paid: 0,
        balance: amount,
        user_id: (await supabase.auth.getUser()).data.user?.id || ''
      });

    if (error) {
      return {
        success: false,
        message: isEnglish 
          ? `Failed to save purchase: ${error.message}`
          : `വാങ്ങൽ സംരക്ഷിക്കാൻ പരാജയപ്പെട്ടു: ${error.message}`,
        summary: isEnglish ? 'Purchase failed.' : 'വാങ്ങൽ പരാജയപ്പെട്ടു.',
        debug: `amount: ${amount}, supplier: ${supplierName}, error: ${error.message}`
      };
    }
    
    // Insert into transactions as expense
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        type: 'expense',
        amount: amount,
        category: 'Purchase',
        description: `Purchase from ${supplierName} via voice`,
        user_id: (await supabase.auth.getUser()).data.user?.id || ''
      });
    if (txError) {
      return {
        success: false,
        message: isEnglish 
          ? `Purchase saved but failed to add to transactions: ${txError.message}`
          : `വാങ്ങൽ സംരക്ഷിച്ചു, പക്ഷേ ട്രാൻസാക്ഷനിൽ ചേർക്കാൻ പരാജയപ്പെട്ടു: ${txError.message}`,
        summary: isEnglish ? 'Purchase partial success.' : 'വാങ്ങൽ ഭാഗിക വിജയമാണ്.',
        debug: `amount: ${amount}, supplier: ${supplierName}, txError: ${txError.message}`
      };
    }
    
    return {
      success: true,
      message: isEnglish 
        ? `Successfully recorded purchase of ₹${amount} from ${supplierName}.`
        : `${supplierName} ൽ നിന്ന് ₹${amount} വാങ്ങൽ വിജയകരമായി രേഖപ്പെടുത്തി.`,
      summary: isEnglish ? `Purchase: ₹${amount} (${supplierName})` : `വാങ്ങൽ: ₹${amount} (${supplierName})`,
      debug: `amount: ${amount}, supplier: ${supplierName}`
    };
  }

  private static async handleBorrowCommand(command: string, amount: number | null, lowerCommand: string, isEnglish: boolean, amountText?: string): Promise<VoiceCommandResult> {
    if (!amount || isNaN(amount)) {
      return {
        success: false,
        message: isEnglish 
          ? "Amount not recognized. Please say the amount clearly or enter it manually."
          : "തുക തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല. ദയവായി തുക വ്യക്തമായി പറയുക അല്ലെങ്കിൽ കൈമാറുക.",
        summary: isEnglish ? "Amount not recognized." : "തുക തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല.",
        debug: `transcript: ${command}, extracted amount: ${amountText}`
      };
    }
    let borrowerName = isEnglish ? "Unknown Person" : "അജ്ഞാത വ്യക്തി";
    // Try compromise NLP for person extraction (English only)
    if (isEnglish) {
      const doc = nlp(command);
      const people = doc.people().out('array');
      if (people.length > 0) borrowerName = people[0];
    }
    let nameMatch = lowerCommand.match(/(?:to|from|give|gave)\s+([\w\s]+)/i);
    if (!nameMatch) {
      nameMatch = lowerCommand.match(/([\w\s]+)\s+borrowed/i);
    }
    if (!nameMatch && !isEnglish) {
      nameMatch = lowerCommand.match(/([\w\s]+)(ക്ക്|നു|കടം|വാങ്ങി)/i);
    }
    if (!nameMatch) {
      const words = lowerCommand.split(' ');
      const filtered = words.filter(w => isNaN(Number(w)) && !['borrow','കടം','from','to','give','gave','rupees','രൂപ','rs'].includes(w));
      if (filtered.length > 0) {
        borrowerName = filtered.slice(-3).join(' ');
      }
      if ((!borrowerName || borrowerName === "Unknown Person" || borrowerName.trim() === "") && filtered.length > 0) {
        borrowerName = filtered[0];
      }
    } else {
      borrowerName = nameMatch[1].replace(/(rupees|രൂപ|rs)/g, '').trim();
    }
    // In handleBorrowCommand, do the same for borrowerName
    let commandWithoutAmount = lowerCommand;
    if (amountText) {
      commandWithoutAmount = commandWithoutAmount.replace(amountText, '').replace(/\s{2,}/g, ' ').trim();
    }
    const cleanedForBorrower = cleanForNameExtraction(commandWithoutAmount, isEnglish ? 'english' : 'malayalam');
    if (cleanedForBorrower) {
      borrowerName = cleanedForBorrower;
    }
    // Fuzzy match fallback for borrowerName (optional, if you want to match against a people list)
    if (!borrowerName || borrowerName === "Unknown Person" || borrowerName.trim() === "") {
      const fuzzy = fuse.search(command);
      if (fuzzy.length > 0 && fuzzy[0].score !== undefined && fuzzy[0].score < 0.4) {
        borrowerName = fuzzy[0].item;
      }
    }
    // If still not found, use the whole transcript as borrower name
    if (!borrowerName || borrowerName === "Unknown Person" || borrowerName.trim() === "") {
      borrowerName = command.trim();
    }
    if (!isEnglish) {
      // Try Malayalam-specific patterns
      let mlMatch = lowerCommand.match(/([\S]+) വിതരണക്കാരൻ/);
      if (!mlMatch) mlMatch = lowerCommand.match(/([\S]+) വിതരണക്കാരി/);
      if (!mlMatch) mlMatch = lowerCommand.match(/([\S]+) വിതരണക്കാർ/);
      if (mlMatch && mlMatch[1]) {
        borrowerName = mlMatch[1].trim();
      }
      // Fuzzy match against Malayalam name list
      if (!borrowerName || borrowerName === "അജ്ഞാത വ്യക്തി" || borrowerName.trim() === "") {
        const fuzzy = malayalamFuse.search(command);
        if (fuzzy.length > 0 && fuzzy[0].score !== undefined && fuzzy[0].score < 0.4) {
          borrowerName = fuzzy[0].item;
        }
      }
    }
    // Fallback: use last few non-number words
    if (!borrowerName || borrowerName === "അജ്ഞാത വ്യക്തി" || borrowerName.trim() === "") {
      const words = lowerCommand.split(' ');
      const filtered = words.filter(w => isNaN(Number(w)) && !['borrow','കടം','from','to','give','gave','rupees','രൂപ','rs','വിതരണക്കാരൻ'].includes(w));
      if (filtered.length > 0) {
        borrowerName = filtered.slice(-3).join(' ');
      }
      if ((!borrowerName || borrowerName === "അജ്ഞാത വ്യക്തി" || borrowerName.trim() === "") && filtered.length > 0) {
        borrowerName = filtered[0];
      }
    }
    // Block saving and show warning if name is blank, 'അജ്ഞാത', or suspicious
    if (!borrowerName || borrowerName === "അജ്ഞാത വ്യക്തി" || borrowerName.trim() === "" || /unknown|blank|supplier|person|അജ്ഞാത/i.test(borrowerName)) {
      return {
        success: false,
        message: isEnglish 
          ? "Borrower name not recognized. Please say the name clearly or enter it manually."
          : "വ്യക്തിയുടെ പേര് തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല. ദയവായി പേര് വ്യക്തമായി പറയുക അല്ലെങ്കിൽ കൈയോടെ നൽകുക.",
        summary: isEnglish ? "Borrower name not recognized." : "വ്യക്തിയുടെ പേര് തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല.",
        debug: `transcript: ${command}, extracted borrower: ${borrowerName}`
      };
    }

    const { data: borrowData, error: borrowError } = await supabase
      .from('borrows')
      .insert({
        borrower_name: borrowerName,
        total_given: amount,
        amount_paid: 0,
        balance: amount,
        user_id: (await supabase.auth.getUser()).data.user?.id || ''
      });

    if (borrowError) throw borrowError;
    
    // Insert into transactions as expense
    const { error: txBorrowError } = await supabase
      .from('transactions')
      .insert({
        type: 'expense',
        amount: amount,
        category: 'Borrow',
        description: `Borrow to ${borrowerName} via voice`,
        user_id: (await supabase.auth.getUser()).data.user?.id || ''
      });
    if (txBorrowError) {
      return {
        success: false,
        message: isEnglish
          ? "Could not save the transaction. Please try again."
          : "ഇടപാട് സംരക്ഷിക്കാൻ കഴിഞ്ഞില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
      };
    }
  }
}