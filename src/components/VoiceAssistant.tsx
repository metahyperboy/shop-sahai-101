
import { useState, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Mic, MicOff, Volume2 } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { VoiceCommandService } from "@/services/voiceCommandService";
import React, { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { universalNumberParser } from "@/services/voiceCommandService";

type BorrowConversationStep = 'idle' | 'askName' | 'askAmount' | 'askPaid' | 'confirm' | 'done';
interface BorrowConversationState {
  step: BorrowConversationStep;
  name: string;
  amount: string;
  paid: string;
}

type PurchaseConversationStep = 'idle' | 'askSupplier' | 'askAmount' | 'askPaid' | 'confirm' | 'done';
interface PurchaseConversationState {
  step: PurchaseConversationStep;
  supplier: string;
  amount: string;
  paid: string;
}

interface VoiceAssistantProps {
  onClose: () => void;
  language: string;
}

// Debounce helper
function debounce(fn: (...args: any[]) => void, delay: number) {
  let timer: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const VoiceAssistant = ({ onClose, language }: VoiceAssistantProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [response, setResponse] = useState("");
  const [debugInfo, setDebugInfo] = useState("");
  const [borrowState, setBorrowState] = useState<BorrowConversationState>({
    step: 'idle',
    name: '',
    amount: '',
    paid: ''
  });
  const [purchaseState, setPurchaseState] = useState<PurchaseConversationState>({
    step: 'idle',
    supplier: '',
    amount: '',
    paid: ''
  });
  const [mlVoices, setMlVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [enVoices, setEnVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | undefined>(undefined);
  // Add state for editable confirmation fields
  const [borrowConfirmEdit, setBorrowConfirmEdit] = useState<BorrowConversationState | null>(null);
  const [purchaseConfirmEdit, setPurchaseConfirmEdit] = useState<PurchaseConversationState | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      const populateVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        // Malayalam voices
        const ml = voices.filter(v => v.lang === "ml-IN");
        setMlVoices(ml);
        // English voices
        const en = voices.filter(v => v.lang === "en-US");
        setEnVoices(en);
        // Default to high-quality voice for selected language
        if (language === "malayalam" && ml.length > 0 && !selectedVoiceURI) {
          // Prefer Google, Microsoft, Apple voices
          const preferred = ml.find(v => /Google|Microsoft|Apple/i.test(v.name));
          setSelectedVoiceURI(preferred ? preferred.voiceURI : ml[0].voiceURI);
        } else if (language === "english" && en.length > 0 && !selectedVoiceURI) {
          const preferred = en.find(v => /Google|Microsoft|Apple/i.test(v.name));
          setSelectedVoiceURI(preferred ? preferred.voiceURI : en[0].voiceURI);
        }
      };
      populateVoices();
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }
  }, [language, selectedVoiceURI]);

  const isEnglish = language === "english";
  const { speak: speakRaw } = useTextToSpeech({ language, voiceURI: selectedVoiceURI });
  // Wrap speak to set isSpeaking
  const speak = useCallback((text: string, onDone?: () => void) => {
    setIsSpeaking(true);
    speakRaw(text, () => {
      setIsSpeaking(false);
      if (onDone) onDone();
    });
  }, [speakRaw]);
  const speakMemo = useCallback(speak, [speak]);

  // Helper to auto-restart listening after TTS, with cooldown
  const autoListen = () => {
    if (!isListening && !isSpeaking && borrowState.step !== 'done' && purchaseState.step !== 'done') {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      cooldownRef.current = setTimeout(() => {
        if (!isSpeaking) startListening();
      }, 500); // 500ms cooldown
    }
  };

  const processVoiceCommand = async (command: string) => {
    setIsProcessing(true);
    const result = await VoiceCommandService.processCommand(command, language);
    setResponse(result.message);
    setDebugInfo(result.debug || "");
    setIsProcessing(false);
    // Speak summary if available, else full message
    speakMemo(result.summary || result.message);
    // Fire event if data was added
    if (result.success && /successfully|വിജയകരമായി/.test(result.message)) {
      // If the result contains type, amount, category, and description, dispatch add-transaction
      if (result.type && result.amount && result.category) {
        window.dispatchEvent(new CustomEvent('add-transaction', {
          detail: {
            type: result.type,
            amount: result.amount,
            category: result.category,
            description: result.description || ''
          },
          bubbles: true,
          cancelable: true,
          composed: true
        }));
      }
      window.dispatchEvent(new CustomEvent('data-updated'));
    }
  };

  const handleSpeechError = (error: string) => {
    console.error('[VoiceAssistant] Speech recognition error:', error);
    
    let errorMessage = '';
    if (error.includes('no-speech')) {
      errorMessage = isEnglish 
        ? 'No speech detected. Please speak clearly and try again.'
        : 'സംസാരം കണ്ടെത്തിയില്ല. ദയവായി വ്യക്തമായി സംസാരിച്ച് വീണ്ടും ശ്രമിക്കുക.';
    } else if (error.includes('audio-capture')) {
      errorMessage = isEnglish 
        ? 'Microphone access denied. Please allow microphone access and try again.'
        : 'മൈക്രോഫോൺ ആക്സസ് നിഷേധിച്ചു. ദയവായി മൈക്രോഫോൺ ആക്സസ് അനുവദിച്ച് വീണ്ടും ശ്രമിക്കുക.';
    } else if (error.includes('network')) {
      errorMessage = isEnglish 
        ? 'Network error. Please check your internet connection and try again.'
        : 'നെറ്റ്‌വർക്ക് പിഴവ്. ദയവായി ഇന്റർനെറ്റ് കണക്ഷൻ പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കുക.';
    } else {
      errorMessage = isEnglish 
        ? `Speech recognition error: ${error}. Please try again.`
        : `സംസാര തിരിച്ചറിയൽ പിഴവ്: ${error}. ദയവായി വീണ്ടും ശ്രമിക്കുക.`;
    }
    
    setResponse(errorMessage);
    setMicError(errorMessage);
    speakMemo(errorMessage);
  };

  // Helper to reset borrow conversation
  const resetBorrowConversation = () => setBorrowState({ step: 'idle', name: '', amount: '', paid: '' });

  // Conversational flow for Borrow
  const startBorrowConversation = () => {
    setBorrowState({ step: 'askName', name: '', amount: '', paid: '' });
    setResponse(isEnglish ? 'Let’s add a borrow record. Who did you borrow from?' : 'ആർക്കാണ് കടം കൊടുത്തത്?');
    speakMemo(isEnglish ? 'Let’s add a borrow record. Who did you borrow from?' : 'ആർക്കാണ് കടം കൊടുത്തത്?', autoListen);
  };

  // Process user reply in borrow flow
  const handleBorrowReply = (transcript: string) => {
    if (borrowState.step === 'askName') {
      setBorrowState(s => ({ ...s, name: transcript, step: 'askAmount' }));
      setResponse(isEnglish ? `How much did you borrow from ${transcript}?` : `${transcript} എത്ര രൂപ കടം കൊടുത്തു?`);
      speakMemo(isEnglish ? `How much did you borrow from ${transcript}?` : `${transcript} എത്ര രൂപ കടം കൊടുത്തു?`, autoListen);
    } else if (borrowState.step === 'askAmount') {
      // Enhanced number parsing and validation
      console.log('[VoiceAssistant] Processing amount transcript:', transcript);
      
      // Try to parse Malayalam/English number words first
      const parsedAmount = universalNumberParser(transcript);
      let amount = '';
      
      if (parsedAmount !== null && parsedAmount > 0) {
        amount = parsedAmount.toString();
        console.log('[VoiceAssistant] Successfully parsed amount:', amount);
      } else {
        // Fallback to regex extraction
        const digitMatch = transcript.match(/\d+/);
        if (digitMatch && parseInt(digitMatch[0]) > 0) {
          amount = digitMatch[0];
          console.log('[VoiceAssistant] Extracted amount via regex:', amount);
        } else {
          console.log('[VoiceAssistant] Failed to parse amount from transcript:', transcript);
          setResponse(isEnglish 
            ? `I couldn't understand the amount "${transcript}". Please say a clear number like "1000" or "one thousand".`
            : `തുക "${transcript}" മനസ്സിലായില്ല. ദയവായി "1000" അല്ലെങ്കിൽ "ആയിരം" പോലെ വ്യക്തമായി പറയുക.`
          );
          speakMemo(isEnglish 
            ? `I couldn't understand the amount. Please say a clear number like "1000" or "one thousand".`
            : `തുക മനസ്സിലായില്ല. ദയവായി "1000" അല്ലെങ്കിൽ "ആയിരം" പോലെ വ്യക്തമായി പറയുക.`, 
            autoListen
          );
          return;
        }
      }
      
      setBorrowState(s => ({ ...s, amount, step: 'askPaid' }));
      setResponse(isEnglish ? 'How much have you paid back so far?' : '\u0d07\u0d24\u0d41\u0d35\u0d30\u0d46 \u0d0e\u0d24\u0d4d\u0d30 \u0d30\u0d42\u0d2a \u0d24\u0d3f\u0d30\u0d3f\u0d15\u0d46 \u0d28\u0d7d\u0d15\u0d3f?');
      speakMemo(isEnglish ? 'How much have you paid back so far?' : '\u0d07\u0d24\u0d41\u0d35\u0d30\u0d46 \u0d0e\u0d24\u0d4d\u0d30 \u0d30\u0d42\u0d2a \u0d24\u0d3f\u0d30\u0d3f\u0d15\u0d46 \u0d28\u0d7d\u0d15\u0d3f?', autoListen);
    } else if (borrowState.step === 'askPaid') {
      // Enhanced number parsing and validation for paid amount
      console.log('[VoiceAssistant] Processing paid amount transcript:', transcript);
      
      // Try to parse Malayalam/English number words first
      const parsedPaid = universalNumberParser(transcript);
      let paid = '0'; // Default to 0 if not specified
      
      if (parsedPaid !== null && parsedPaid >= 0) {
        paid = parsedPaid.toString();
        console.log('[VoiceAssistant] Successfully parsed paid amount:', paid);
      } else {
        // Fallback to regex extraction
        const digitMatch = transcript.match(/\d+/);
        if (digitMatch && parseInt(digitMatch[0]) >= 0) {
          paid = digitMatch[0];
          console.log('[VoiceAssistant] Extracted paid amount via regex:', paid);
        } else {
          // If no valid number found, assume 0
          paid = '0';
          console.log('[VoiceAssistant] No valid paid amount found, defaulting to 0');
        }
      }
      
      const newState: BorrowConversationState = { ...borrowState, paid, step: 'confirm' as BorrowConversationStep };
      setBorrowState(newState);
      setBorrowConfirmEdit(newState); // set editable fields
      setResponse(isEnglish
        ? `You borrowed ₹${borrowState.amount} from ${borrowState.name} and have paid back ₹${paid}. Should I save this?`
        : `നിങ്ങൾ ${borrowState.name} എന്നയാളിൽ നിന്ന് ₹${borrowState.amount} കടം എടുത്തു, ഇതുവരെ ₹${paid} തിരികെ നൽകി. ഇത് സേവ് ചെയ്യട്ടേ?`
      );
      speakMemo(isEnglish
        ? `You borrowed ₹${borrowState.amount} from ${borrowState.name} and have paid back ₹${paid}. Should I save this?`
        : `നിങ്ങൾ ${borrowState.name} എന്നയാളിൽ നിന്ന് ₹${borrowState.amount} കടം എടുത്തു, ഇതുവരെ ₹${paid} തിരികെ നൽകി. ഇത് സേവ് ചെയ്യട്ടേ?`, autoListen
      );
    } else if (borrowState.step === 'confirm') {
      if (/yes|save|okay|confirm|ശരി|സേവ്|ഉണ്ട്/i.test(transcript)) {
        // Use edited fields if present
        const data = borrowConfirmEdit || borrowState;
        
        // Validate data before dispatching
        if (!data.name || !data.amount || data.amount === '0') {
          console.log('[VoiceAssistant] Invalid borrow data:', data);
          setResponse(isEnglish 
            ? 'Missing required information. Please provide the person\'s name and amount.'
            : 'ആവശ്യമായ വിവരങ്ങൾ കാണുന്നില്ല. ദയവായി വ്യക്തിയുടെ പേരും തുകയും നൽകുക.'
          );
          speakMemo(isEnglish 
            ? 'Missing required information. Please provide the person\'s name and amount.'
            : 'ആവശ്യമായ വിവരങ്ങൾ കാണുന്നില്ല. ദയവായി വ്യക്തിയുടെ പേരും തുകയും നൽകുക.', 
            autoListen
          );
          return;
        }
        
        console.log('[VoiceAssistant] Dispatching add-borrow event with data:', data);
        window.dispatchEvent(new CustomEvent('add-borrow', { detail: {
          name: data.name,
          totalGiven: data.amount,
          amountPaid: data.paid || '0'
        }}));
        setBorrowState(s => ({ ...s, step: 'done' }));
        setBorrowConfirmEdit(null);
        setResponse(isEnglish ? 'Record added successfully!' : 'റെക്കോർഡ് വിജയകരമായി ചേർത്തു!');
        speakMemo(isEnglish ? 'Record added successfully!' : 'റെക്കോർഡ് വിജയകരമായി ചേർത്തു!');
      } else if (/no|change|back|വേണ്ട|മാറ്റം|തിരിച്ച്/i.test(transcript)) {
        setBorrowState(s => ({ ...s, step: 'askAmount' }));
        setBorrowConfirmEdit(null);
        setResponse(isEnglish ? 'Okay, let’s change the amount. How much did you borrow?' : 'ശരി, എത്ര രൂപ കടം എടുത്തു?');
        speakMemo(isEnglish ? 'Okay, let’s change the amount. How much did you borrow?' : 'ശരി, എത്ര രൂപ കടം എടുത്തു?', autoListen);
      } else {
        setResponse(isEnglish ? 'Please say Yes to save, or No to change.' : 'സേവ് ചെയ്യാൻ ഉണ്ട് എന്ന് പറയുക, അല്ലെങ്കിൽ മാറ്റാൻ വേണ്ട എന്ന് പറയുക.');
        speakMemo(isEnglish ? 'Please say Yes to save, or No to change.' : 'സേവ് ചെയ്യാൻ ഉണ്ട് എന്ന് പറയുക, അല്ലെങ്കിൽ മാറ്റാൻ വേണ്ട എന്ന് പറയുക.', autoListen);
      }
    }
  };

  // Listen for quick commands
  const handleQuickCommands = (transcript: string) => {
    if (/clear|reset|വ്യക്തം|റീസെറ്റ്/i.test(transcript)) {
      resetBorrowConversation();
      setResponse(isEnglish ? 'Form cleared. Let’s start again. Who did you borrow from?' : 'ഫോം ക്ലിയർ ചെയ്തു. ആരിൽ നിന്നാണ് കടം എടുത്തത്?');
      speakMemo(isEnglish ? 'Form cleared. Let’s start again. Who did you borrow from?' : 'ഫോം ക്ലിയർ ചെയ്തു. ആരിൽ നിന്നാണ് കടം എടുത്തത്?', autoListen);
      setBorrowState(s => ({ ...s, step: 'askName' }));
      return true;
    }
    if (/cancel|exit|stop|വേണ്ട|പുറത്ത്/i.test(transcript)) {
      resetBorrowConversation();
      setResponse(isEnglish ? 'Cancelled.' : 'റദ്ദാക്കി.');
      speakMemo(isEnglish ? 'Cancelled.' : 'റദ്ദാക്കി.');
      return true;
    }
    return false;
  };

  const resetPurchaseConversation = () => setPurchaseState({ step: 'idle', supplier: '', amount: '', paid: '' });
  const startPurchaseConversation = () => {
    setPurchaseState({ step: 'askSupplier', supplier: '', amount: '', paid: '' });
    setResponse(isEnglish ? 'Let’s add a purchase record. Who is the supplier?' : 'വാങ്ങൽ രേഖ ചേർക്കാം. സപ്ലയർ ആരാണ്?');
    speakMemo(isEnglish ? 'Let’s add a purchase record. Who is the supplier?' : 'വാങ്ങൽ രേഖ ചേർക്കാം. സപ്ലയർ ആരാണ്?', autoListen);
  };
  const handlePurchaseReply = (transcript: string) => {
    if (purchaseState.step === 'askSupplier') {
      setPurchaseState(s => ({ ...s, supplier: transcript, step: 'askAmount' }));
      setResponse(isEnglish ? `How much did you purchase from ${transcript}?` : `${transcript}യിൽ നിന്ന് എത്ര രൂപയ്ക്ക് വാങ്ങി?`);
      speakMemo(isEnglish ? `How much did you purchase from ${transcript}?` : `${transcript}യിൽ നിന്ന് എത്ര രൂപയ്ക്ക് വാങ്ങി?`, autoListen);
    } else if (purchaseState.step === 'askAmount') {
      // Enhanced number parsing and validation
      console.log('[VoiceAssistant] Processing purchase amount transcript:', transcript);
      
      // Try to parse Malayalam/English number words first
      const parsedAmount = universalNumberParser(transcript);
      let amount = '';
      
      if (parsedAmount !== null && parsedAmount > 0) {
        amount = parsedAmount.toString();
        console.log('[VoiceAssistant] Successfully parsed purchase amount:', amount);
      } else {
        // Fallback to regex extraction
        const digitMatch = transcript.match(/\d+/);
        if (digitMatch && parseInt(digitMatch[0]) > 0) {
          amount = digitMatch[0];
          console.log('[VoiceAssistant] Extracted purchase amount via regex:', amount);
        } else {
          console.log('[VoiceAssistant] Failed to parse purchase amount from transcript:', transcript);
          setResponse(isEnglish 
            ? `I couldn't understand the amount "${transcript}". Please say a clear number like "1000" or "one thousand".`
            : `തുക "${transcript}" മനസ്സിലായില്ല. ദയവായി "1000" അല്ലെങ്കിൽ "ആയിരം" പോലെ വ്യക്തമായി പറയുക.`
          );
          speakMemo(isEnglish 
            ? `I couldn't understand the amount. Please say a clear number like "1000" or "one thousand".`
            : `തുക മനസ്സിലായില്ല. ദയവായി "1000" അല്ലെങ്കിൽ "ആയിരം" പോലെ വ്യക്തമായി പറയുക.`, 
            autoListen
          );
          return;
        }
      }
      
      setPurchaseState(s => ({ ...s, amount, step: 'askPaid' }));
      setResponse(isEnglish ? 'How much have you paid so far?' : '\u0d07\u0d24\u0d41\u0d35\u0d30\u0d46 \u0d0e\u0d24\u0d4d\u0d30 \u0d30\u0d42\u0d2a \u0d28\u0d7d\u0d15\u0d3f?');
      speakMemo(isEnglish ? 'How much have you paid so far?' : '\u0d07\u0d24\u0d41\u0d35\u0d30\u0d46 \u0d0e\u0d24\u0d4d\u0d30 \u0d30\u0d42\u0d2a \u0d28\u0d7d\u0d15\u0d3f?', autoListen);
    } else if (purchaseState.step === 'askPaid') {
      // Enhanced number parsing and validation for paid amount
      console.log('[VoiceAssistant] Processing purchase paid amount transcript:', transcript);
      
      // Try to parse Malayalam/English number words first
      const parsedPaid = universalNumberParser(transcript);
      let paid = '0'; // Default to 0 if not specified
      
      if (parsedPaid !== null && parsedPaid >= 0) {
        paid = parsedPaid.toString();
        console.log('[VoiceAssistant] Successfully parsed purchase paid amount:', paid);
      } else {
        // Fallback to regex extraction
        const digitMatch = transcript.match(/\d+/);
        if (digitMatch && parseInt(digitMatch[0]) >= 0) {
          paid = digitMatch[0];
          console.log('[VoiceAssistant] Extracted purchase paid amount via regex:', paid);
        } else {
          // If no valid number found, assume 0
          paid = '0';
          console.log('[VoiceAssistant] No valid purchase paid amount found, defaulting to 0');
        }
      }
      
      const newState: PurchaseConversationState = { ...purchaseState, paid, step: 'confirm' as PurchaseConversationStep };
      setPurchaseState(newState);
      setPurchaseConfirmEdit(newState); // set editable fields
      setResponse(isEnglish
        ? `You purchased for ₹${purchaseState.amount} from ${purchaseState.supplier} and have paid ₹${paid}. Should I save this?`
        : `നിങ്ങൾ ${purchaseState.supplier}യിൽ നിന്ന് ₹${purchaseState.amount}ക്ക് വാങ്ങി, ഇതുവരെ ₹${paid} നൽകി. ഇത് സേവ് ചെയ്യട്ടേ?`
      );
      speakMemo(isEnglish
        ? `You purchased for ₹${purchaseState.amount} from ${purchaseState.supplier} and have paid ₹${paid}. Should I save this?`
        : `നിങ്ങൾ ${purchaseState.supplier}യിൽ നിന്ന് ₹${purchaseState.amount}ക്ക് വാങ്ങി, ഇതുവരെ ₹${paid} നൽകി. ഇത് സേവ് ചെയ്യട്ടേ?`, autoListen
      );
    } else if (purchaseState.step === 'confirm') {
      if (/yes|save|okay|confirm|ശരി|സേവ്|ഉണ്ട്/i.test(transcript)) {
        const data = purchaseConfirmEdit || purchaseState;
        
        // Validate data before dispatching
        if (!data.supplier || !data.amount || data.amount === '0') {
          console.log('[VoiceAssistant] Invalid purchase data:', data);
          setResponse(isEnglish 
            ? 'Missing required information. Please provide the supplier name and amount.'
            : 'ആവശ്യമായ വിവരങ്ങൾ കാണുന്നില്ല. ദയവായി സപ്ലയർ പേരും തുകയും നൽകുക.'
          );
          speakMemo(isEnglish 
            ? 'Missing required information. Please provide the supplier name and amount.'
            : 'ആവശ്യമായ വിവരങ്ങൾ കാണുന്നില്ല. ദയവായി സപ്ലയർ പേരും തുകയും നൽകുക.', 
            autoListen
          );
          return;
        }
        
        console.log('[VoiceAssistant] Dispatching add-purchase event with data:', data);
        window.dispatchEvent(new CustomEvent('add-purchase', { detail: {
          supplierName: data.supplier,
          totalAmount: data.amount,
          amountPaid: data.paid || '0'
        }}));
        setPurchaseState(s => ({ ...s, step: 'done' }));
        setPurchaseConfirmEdit(null);
        setResponse(isEnglish ? 'Purchase record added successfully!' : 'വാങ്ങൽ രേഖ വിജയകരമായി ചേർത്തു!');
        speakMemo(isEnglish ? 'Purchase record added successfully!' : 'വാങ്ങൽ രേഖ വിജയകരമായി ചേർത്തു!');
      } else if (/no|change|back|വേണ്ട|മാറ്റം|തിരിച്ച്/i.test(transcript)) {
        setPurchaseState(s => ({ ...s, step: 'askAmount' }));
        setPurchaseConfirmEdit(null);
        setResponse(isEnglish ? 'Okay, let’s change the amount. How much did you purchase?' : 'ശരി, എത്ര രൂപയ്ക്ക് വാങ്ങി?');
        speakMemo(isEnglish ? 'Okay, let’s change the amount. How much did you purchase?' : 'ശരി, എത്ര രൂപയ്ക്ക് വാങ്ങി?', autoListen);
      } else {
        setResponse(isEnglish ? 'Please say Yes to save, or No to change.' : 'സേവ് ചെയ്യാൻ ഉണ്ട് എന്ന് പറയുക, അല്ലെങ്കിൽ മാറ്റാൻ വേണ്ട എന്ന് പറയുക.');
        speakMemo(isEnglish ? 'Please say Yes to save, or No to change.' : 'സേവ് ചെയ്യാൻ ഉണ്ട് എന്ന് പറയുക, അല്ലെങ്കിൽ മാറ്റാൻ വേണ്ട എന്ന് പറയുക.', autoListen);
      }
    }
  };
  const handlePurchaseQuickCommands = (transcript: string) => {
    if (/clear|reset|വ്യക്തം|റീസെറ്റ്/i.test(transcript)) {
      resetPurchaseConversation();
      setResponse(isEnglish ? 'Form cleared. Let’s start again. Who is the supplier?' : 'ഫോം ക്ലിയർ ചെയ്തു. സപ്ലയർ ആരാണ്?');
      speakMemo(isEnglish ? 'Form cleared. Let’s start again. Who is the supplier?' : 'ഫോം ക്ലിയർ ചെയ്തു. സപ്ലയർ ആരാണ്?', autoListen);
      setPurchaseState(s => ({ ...s, step: 'askSupplier' }));
      return true;
    }
    if (/cancel|exit|stop|വേണ്ട|പുറത്ത്/i.test(transcript)) {
      resetPurchaseConversation();
      setResponse(isEnglish ? 'Cancelled.' : 'റദ്ദാക്കി.');
      speakMemo(isEnglish ? 'Cancelled.' : 'റദ്ദാക്കി.');
      return true;
    }
    return false;
  };

  // Main handler for transcript in conversational mode
  const handleTranscript = (transcript: string) => {
    // Purchase conversational flow
    if (purchaseState.step !== 'idle') {
      if (!handlePurchaseQuickCommands(transcript)) {
        handlePurchaseReply(transcript);
      }
      return;
    }
    // Borrow conversational flow
    if (borrowState.step !== 'idle') {
      if (!handleQuickCommands(transcript)) {
        handleBorrowReply(transcript);
      }
      return;
    }
    // Fallback: check for "add purchase" command to start flow
    if (/purchase|buy|വാങ്ങൽ|വാങ്ങി/i.test(transcript)) {
      startPurchaseConversation();
      return;
    }
    // Fallback: check for "add borrow" command to start flow
    if (/borrow|കടം/i.test(transcript)) {
      startBorrowConversation();
      return;
    }
    // Otherwise, fallback to old processVoiceCommand
    processVoiceCommand(transcript);
  };

  // Debounced transcript handler (increased to 400ms)
  const debouncedHandleTranscript = useMemo(() => debounce(handleTranscript, 400), [handleTranscript]);

  // Use debounced handler in useSpeechRecognition
  const { isListening, transcript, startListening, stopListening, isSupported } = useSpeechRecognition({
    language,
    onResult: debouncedHandleTranscript,
    onError: handleSpeechError
  });
  const [micError, setMicError] = useState("");

  const handleVoiceClick = () => {
    setMicError("");
    if (!isSupported) {
      setMicError(isEnglish ? "Your browser does not support voice recognition." : "നിങ്ങളുടെ ബ്രൗസർ വോയ്സ് റെക്കഗ്നിഷൻ പിന്തുണയ്ക്കുന്നില്ല.");
      return;
    }
    if (isSpeaking) {
      setMicError(isEnglish ? "Please wait for the assistant to finish speaking." : "വോയ്സ് അസിസ്റ്റന്റ് സംസാരിക്കുന്നത് കഴിയുന്നത് വരെ കാത്തിരിക്കുക.");
      return;
    }
    if (isListening) {
      stopListening();
    } else {
      setResponse("");
      startListening();
    }
  };

  // Show error if not supported on mount
  React.useEffect(() => {
    if (!isSupported) {
      setMicError(isEnglish ? "Your browser does not support voice recognition." : "നിങ്ങളുടെ ബ്രൗസർ വോയ്സ് റെക്കഗ്നിഷൻ പിന്തുണയ്ക്കുന്നില്ല.");
    }
  }, [isSupported, isEnglish]);

  // Listen for add-borrow event and trigger BorrowManagement add
  React.useEffect(() => {
    const handler = (e: any) => {
      // Dispatch a custom event for BorrowManagement to handle
      window.dispatchEvent(new CustomEvent('data-updated'));
    };
    window.addEventListener('add-borrow', handler);
    return () => window.removeEventListener('add-borrow', handler);
  }, []);

  // Listen for add-purchase event and trigger ItemPurchase add
  React.useEffect(() => {
    const handler = (e: any) => {
      window.dispatchEvent(new CustomEvent('data-updated'));
    };
    window.addEventListener('add-purchase', handler);
    return () => window.removeEventListener('add-purchase', handler);
  }, []);

  // Listen for add-borrow-result to give accurate feedback
  useEffect(() => {
    if (borrowState.step === 'done') return; // Already handled
    const handleAddBorrowResult = (e: any) => {
      if (borrowState.step === 'done') return; // Already handled
      if (e.detail?.success) {
        setResponse(isEnglish ? 'Record added successfully!' : '\u0d31\u0d46\u0d15\u0d4d\u0d15\u0d4b\u0d7c\u0d21\u0d4d \u0d35\u0d3f\u0d1c\u0d2f\u0d15\u0d30\u0d2e\u0d3e\u0d2f\u0d3f \u0d1a\u0d47\u0d7c\u0d24\u0d4d\u0d24\u0d41!');
        speakMemo(isEnglish ? 'Record added successfully!' : '\u0d31\u0d46\u0d15\u0d4d\u0d15\u0d4b\u0d7c\u0d21\u0d4d \u0d35\u0d3f\u0d1c\u0d2f\u0d15\u0d30\u0d2e\u0d3e\u0d2f\u0d3f \u0d1a\u0d47\u0d7c\u0d24\u0d4d\u0d24\u0d41!');
        setBorrowState(s => ({ ...s, step: 'done' }));
        setBorrowConfirmEdit(null);
      } else {
        setResponse(isEnglish ? `Error: ${e.detail?.error || 'Failed to add record.'}` : `\u0d24\u0d3f\u0d30\u0d3f\u0d1a\u0d4d\u0d1a\u0d4d: ${e.detail?.error || '\u0d31\u0d46\u0d15\u0d4d\u0d15\u0d4b\u0d7c\u0d21\u0d4d \u0d1a\u0d47\u0d7c\u0d24\u0d3e\u0d7b'} `);
        speakMemo(isEnglish ? `Error: ${e.detail?.error || 'Failed to add record.'}` : `\u0d24\u0d3f\u0d30\u0d3f\u0d1a\u0d4d\u0d1a\u0d4d: ${e.detail?.error || '\u0d31\u0d46\u0d15\u0d4d\u0d15\u0d4b\u0d7c\u0d21\u0d4d \u0d1a\u0d47\u0d7c\u0d24\u0d3e\u0d7b'}`);
      }
    };
    window.addEventListener('add-borrow-result', handleAddBorrowResult);
    return () => window.removeEventListener('add-borrow-result', handleAddBorrowResult);
  }, [isEnglish, borrowState.step, speakMemo]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">
            {isEnglish ? "Voice Assistant" : "വോയ്സ് അസിസ്റ്റന്റ്"}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        {/* Malayalam and English voice selector */}
        {((language === "malayalam" && mlVoices.length > 1) || (language === "english" && enVoices.length > 1)) && (
          <div className="mb-2 text-center">
            <label className="text-xs mr-2">{isEnglish ? "Select Voice:" : "വോയ്സ് തിരഞ്ഞെടുക്കുക:"}</label>
            <select
              className="text-xs p-1 rounded border"
              value={selectedVoiceURI}
              onChange={e => setSelectedVoiceURI(e.target.value)}
            >
              {(language === "malayalam" ? mlVoices : enVoices).map(v => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
              ))}
            </select>
          </div>
        )}
        <CardContent className="space-y-4">
          {/* Voice Button */}
          <div className="flex justify-center">
            <Button
              className={`rounded-full w-20 h-20 ${
                isListening ? "bg-red-500 hover:bg-red-600" : isSpeaking ? "bg-yellow-400 hover:bg-yellow-500" : "bg-primary hover:bg-primary/90"
              }`}
              onClick={handleVoiceClick}
              disabled={isProcessing || !isSupported || isSpeaking}
            >
              {isListening ? <MicOff className="h-8 w-8" /> : isSpeaking ? <span className="animate-spin">🔊</span> : <Mic className="h-8 w-8" />}
            </Button>
          </div>

          {/* Status */}
          <div className="text-center">
            {isSpeaking && (
              <p className="text-sm text-yellow-700 animate-pulse">
                {isEnglish ? "Speaking..." : "സംസാരിക്കുന്നു..."}
              </p>
            )}
            {isListening && (
              <p className="text-sm text-muted-foreground animate-pulse">
                {isEnglish ? "Listening..." : "കേൾക്കുന്നു..."}
              </p>
            )}
            {isProcessing && (
              <p className="text-sm text-muted-foreground">
                {isEnglish ? "Processing..." : "പ്രോസസ്സ് ചെയ്യുന്നു..."}
              </p>
            )}
            {isSaving && (
              <p className="text-sm text-blue-600 animate-pulse">
                {isEnglish ? "Saving..." : "സേവ് ചെയ്യുന്നു..."}
              </p>
            )}
          </div>

          {/* Error/Warning for mic issues */}
          {micError && (
            <div className="text-xs text-red-600 text-center mb-2">{micError}</div>
          )}

          {/* Transcript */}
          {transcript && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">
                {isEnglish ? "You said:" : "നിങ്ങൾ പറഞ്ഞത്:"}
              </p>
              <p className="text-sm text-muted-foreground">{transcript}</p>
            </div>
          )}

          {/* Response */}
          {(borrowState.step === 'confirm' && borrowConfirmEdit) && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-300 mb-2">
              <p className="text-sm font-semibold mb-2">{isEnglish ? 'Confirm Borrow Details:' : 'കടം വിശദാംശങ്ങൾ സ്ഥിരീകരിക്കുക:'}</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs">{isEnglish ? 'Name:' : 'പേര്:'}</label>
                  <Input className="w-full" value={borrowConfirmEdit.name} onChange={e => setBorrowConfirmEdit(s => s && ({ ...s, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs">{isEnglish ? 'Amount:' : 'തുക:'}</label>
                  <Input className="w-full" value={borrowConfirmEdit.amount} onChange={e => setBorrowConfirmEdit(s => s && ({ ...s, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs">{isEnglish ? 'Paid Back:' : 'തിരികെ നൽകിയ തുക:'}</label>
                  <Input className="w-full" value={borrowConfirmEdit.paid} onChange={e => setBorrowConfirmEdit(s => s && ({ ...s, paid: e.target.value }))} />
                </div>
                {debugInfo && <div className="text-xs text-muted-foreground mt-1">Debug: {debugInfo}</div>}
                <div className="flex gap-2 mt-2">
                  <Button 
                    size="sm" 
                    disabled={
                      borrowState.step !== 'confirm' ||
                      !borrowConfirmEdit?.name || 
                      !borrowConfirmEdit?.amount || 
                      borrowConfirmEdit?.amount === '0' ||
                      isProcessing ||
                      isSaving
                    }
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        const detail = {
                          name: borrowConfirmEdit.name.trim(),
                          totalGiven: borrowConfirmEdit.amount,
                          amountPaid: borrowConfirmEdit.paid || '0'
                        };
                        
                        console.log('Dispatching add-borrow event with:', detail);
                        
                        // Create a promise that resolves when the borrow is saved
                        const waitForSave = new Promise((resolve, reject) => {
                          const handleSaveResult = (e: any) => {
                            window.removeEventListener('add-borrow-result', handleSaveResult);
                            if (e.detail.success) {
                              resolve(true);
                            } else {
                              reject(new Error(e.detail.error || 'Failed to save borrow record'));
                            }
                          };
                          
                          window.addEventListener('add-borrow-result', handleSaveResult);
                          
                          // Create and dispatch the event
                          const event = new CustomEvent('add-borrow', { 
                            detail: detail,
                            bubbles: true,
                            cancelable: true,
                            composed: true
                          });
                          
                          // Dispatch the event and check if it was cancelled
                          const eventDispatched = window.dispatchEvent(event);
                          if (!eventDispatched) {
                            window.removeEventListener('add-borrow-result', handleSaveResult);
                            reject(new Error('Event was cancelled'));
                          }
                        });
                        
                        try {
                          await waitForSave;
                          
                          // Update UI state on success
                          console.log('[VoiceAssistant] Borrow save successful, updating state to done');
                          setBorrowState(s => ({ ...s, step: 'done' }));
                          setBorrowConfirmEdit(null);
                          
                          const successMessage = isEnglish 
                            ? 'Borrow record added successfully!' 
                            : 'കടം രേഖ വിജയകരമായി ചേർത്തു!';
                          
                          setResponse(successMessage);
                          await speakMemo(successMessage);
                        } catch (error) {
                          throw error; // This will be caught by the outer try-catch
                        }
                        
                      } catch (error) {
                        console.error('Error in save borrow:', error);
                        const errorMessage = isEnglish 
                          ? 'Failed to save borrow record. Please try again.' 
                          : 'കടം രേഖ സേവ് ചെയ്യുന്നതിൽ പിഴവ് സംഭവിച്ചു. ദയവായി വീണ്ടും ശ്രമിക്കുക.';
                        
                        setResponse(errorMessage);
                        await speakMemo(errorMessage);
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  >
                    {isSaving ? (isEnglish ? 'Saving...' : 'സേവ് ചെയ്യുന്നു...') : (isEnglish ? 'Save' : 'സേവ് ചെയ്യുക')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setBorrowState(s => ({ ...s, step: 'askAmount' }));
                    setBorrowConfirmEdit(null);
                  }}>{isEnglish ? 'Edit' : 'മാറ്റം ചെയ്യുക'}</Button>
                </div>
              </div>
            </div>
          )}
          {(purchaseState.step === 'confirm' && purchaseConfirmEdit) && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-300 mb-2">
              <p className="text-sm font-semibold mb-2">{isEnglish ? 'Confirm Purchase Details:' : 'വാങ്ങൽ വിശദാംശങ്ങൾ സ്ഥിരീകരിക്കുക:'}</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs">{isEnglish ? 'Supplier:' : 'സപ്ലയർ:'}</label>
                  <Input className="w-full" value={purchaseConfirmEdit.supplier} onChange={e => setPurchaseConfirmEdit(s => s && ({ ...s, supplier: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs">{isEnglish ? 'Amount:' : 'തുക:'}</label>
                  <Input className="w-full" value={purchaseConfirmEdit.amount} onChange={e => setPurchaseConfirmEdit(s => s && ({ ...s, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs">{isEnglish ? 'Paid:' : 'നൽകിയ തുക:'}</label>
                  <Input className="w-full" value={purchaseConfirmEdit.paid} onChange={e => setPurchaseConfirmEdit(s => s && ({ ...s, paid: e.target.value }))} />
                </div>
                {/* Validation and warnings */}
                {(!purchaseConfirmEdit.supplier || /unknown|blank|supplier|person|അജ്ഞാത/i.test(purchaseConfirmEdit.supplier)) && (
                  <div className="text-red-600 font-bold">{isEnglish ? 'Supplier name missing or not recognized!' : 'സപ്ലയർ പേര് കണ്ടെത്തിയില്ല!'}</div>
                )}
                {(!purchaseConfirmEdit.amount || isNaN(Number(purchaseConfirmEdit.amount))) && (
                  <div className="text-red-600 font-bold">{isEnglish ? 'Amount missing or not recognized!' : 'തുക കണ്ടെത്തിയില്ല!'}</div>
                )}
                {debugInfo && <div className="text-xs text-muted-foreground mt-1">Debug: {debugInfo}</div>}
                <div className="flex gap-2 mt-2">
                  <Button 
                    size="sm" 
                    disabled={
                      purchaseState.step !== 'confirm' ||
                      (!purchaseConfirmEdit?.supplier || /unknown|blank|supplier|person|അജ്ഞാത/i.test(purchaseConfirmEdit?.supplier)) || 
                      (!purchaseConfirmEdit?.amount || isNaN(Number(purchaseConfirmEdit?.amount))) ||
                      isProcessing ||
                      isSaving
                    } 
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        const detail = {
                          supplierName: purchaseConfirmEdit.supplier.trim(),
                          totalAmount: purchaseConfirmEdit.amount,
                          amountPaid: purchaseConfirmEdit.paid || '0'
                        };
                        
                        console.log('Dispatching add-purchase event with:', detail);
                        
                        // Create a promise that resolves when the purchase is saved
                        const waitForSave = new Promise((resolve, reject) => {
                          const handleSaveResult = (e: any) => {
                            window.removeEventListener('add-purchase-result', handleSaveResult);
                            if (e.detail.success) {
                              resolve(true);
                            } else {
                              reject(new Error(e.detail.error || 'Failed to save purchase record'));
                            }
                          };
                          
                          window.addEventListener('add-purchase-result', handleSaveResult);
                          
                          // Create and dispatch the event
                          const event = new CustomEvent('add-purchase', { 
                            detail: detail,
                            bubbles: true,
                            cancelable: true,
                            composed: true
                          });
                          
                          // Dispatch the event and check if it was cancelled
                          const eventDispatched = window.dispatchEvent(event);
                          if (!eventDispatched) {
                            window.removeEventListener('add-purchase-result', handleSaveResult);
                            reject(new Error('Event was cancelled'));
                          }
                        });
                        
                        try {
                          await waitForSave;
                          
                          // Update UI state on success
                          console.log('[VoiceAssistant] Purchase save successful, updating state to done');
                          setPurchaseState(s => ({ ...s, step: 'done' }));
                          setPurchaseConfirmEdit(null);
                          
                          const successMessage = isEnglish 
                            ? 'Purchase record added successfully!' 
                            : 'വാങ്ങൽ രേഖ വിജയകരമായി ചേർത്തു!';
                          
                          setResponse(successMessage);
                          await speakMemo(successMessage);
                        } catch (error) {
                          throw error; // This will be caught by the outer try-catch
                        }
                        
                      } catch (error) {
                        console.error('Error in save purchase:', error);
                        const errorMessage = isEnglish 
                          ? 'Failed to save purchase. Please try again.' 
                          : 'വാങ്ങൽ സേവ് ചെയ്യുന്നതിൽ പിഴവ് സംഭവിച്ചു. ദയവായി വീണ്ടും ശ്രമിക്കുക.';
                        
                        setResponse(errorMessage);
                        await speakMemo(errorMessage);
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  >
                    {isSaving ? (isEnglish ? 'Saving...' : 'സേവ് ചെയ്യുന്നു...') : (isEnglish ? 'Save' : 'സേവ് ചെയ്യുക')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setPurchaseState(s => ({ ...s, step: 'askAmount' }));
                    setPurchaseConfirmEdit(null);
                  }}>{isEnglish ? 'Edit' : 'മാറ്റം ചെയ്യുക'}</Button>
                </div>
              </div>
            </div>
          )}
          {response && (
            <div className="p-3 bg-primary/10 rounded-lg">
              <div className="flex items-start space-x-2">
                <Volume2 className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-primary">
                    {isEnglish ? "Assistant:" : "സഹായി:"}
                  </p>
                  <p className="text-sm">{response}</p>
                  {debugInfo && (
                    <div className="text-xs text-muted-foreground mt-1">
                      <p>Debug: {debugInfo}</p>
                      <div className="mt-1 p-2 bg-gray-50 rounded text-xs">
                        <p><strong>Current State:</strong></p>
                        <p>Borrow: {borrowState.step} - {borrowState.name} - ₹{borrowState.amount} - ₹{borrowState.paid}</p>
                        <p>Purchase: {purchaseState.step} - {purchaseState.supplier} - ₹{purchaseState.amount} - ₹{purchaseState.paid}</p>
                      </div>
                    </div>
                  )}
                  {debugInfo && debugInfo.includes('[NAME BLANK OR UNKNOWN]') && (
                    <p className="text-xs text-red-600 mt-1">
                      {isEnglish ? 'Warning: Name could not be recognized. Please try again, speaking the name clearly.' : 'മുന്നറിയിപ്പ്: പേര് തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല. ദയവായി പേര് വ്യക്തമായി പറയുക.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              {isEnglish 
                ? "Tap the microphone and speak your command" 
                : "മൈക്രോഫോണിൽ ടാപ്പ് ചെയ്ത് നിങ്ങളുടെ കമാൻഡ് പറയുക"
              }
            </p>
            <p className="text-xs text-muted-foreground">
              {isEnglish 
                ? "Try: 'Income 500 from sales' or 'Expense 200 for food' or 'Purchase 1000 from ABC' or 'John borrowed 500'"
                : "ശ്രമിക്കുക: 'വിൽപനയിൽ നിന്ന് 500 വരുമാനം' അല്ലെങ്കിൽ 'ഭക്ഷണത്തിന് 200 ചെലവ്' അല്ലെങ്കിൽ 'ABC യിൽ നിന്ന് 1000 വാങ്ങൽ'"
              }
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VoiceAssistant;
