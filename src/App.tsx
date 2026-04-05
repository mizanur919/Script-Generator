/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  FileAudio, Upload, Loader2, FileText, Play, Pause, Trash2, 
  Sparkles, Copy, Check, Edit3, Save, RefreshCw, Layers, Image as ImageIcon, X,
  Bookmark, History, Trash
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type ScriptStyle = 'transcription' | 'sales' | 'storytelling' | 'emotional';

interface ScriptVariation {
  id: number;
  content: string;
  style: ScriptStyle;
}

interface SavedScript {
  id: string;
  content: string;
  style: ScriptStyle;
  timestamp: number;
  mode: 'audio' | 'image';
}

export default function App() {
  const [activeMode, setActiveMode] = useState<'audio' | 'image'>('audio');
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [variations, setVariations] = useState<ScriptVariation[]>([]);
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>(() => {
    const saved = localStorage.getItem('script_studio_saved');
    return saved ? JSON.parse(saved) : [];
  });
  const [showLibrary, setShowLibrary] = useState(false);
  const [activeVariationIndex, setActiveVariationIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<ScriptStyle>('transcription');
  const [variationCount, setVariationCount] = useState(1);
  const [scriptDuration, setScriptDuration] = useState<number | null>(null);
  const [customInstructions, setCustomInstructions] = useState('');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleModeChange = (mode: 'audio' | 'image') => {
    setActiveMode(mode);
    setFile(null);
    setImages([]);
    setVariations([]);
    setSelectedStyle('transcription');
    setVariationCount(1);
    setScriptDuration(null);
    setCustomInstructions('');
    setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type.startsWith('audio/')) {
      setFile(selectedFile);
      setError(null);
    } else if (selectedFile) {
      setError('Please upload a valid audio file.');
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validImages = selectedFiles.filter(file => file.type.startsWith('image/'));
    setImages(prev => [...prev, ...validImages]);
    setError(null);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const generateScripts = async () => {
    if (activeMode === 'audio' && !file) {
      setError('Please upload an audio file.');
      return;
    }
    if (activeMode === 'image' && images.length === 0) {
      setError('Please upload at least one image.');
      return;
    }

    setLoading(true);
    setError(null);
    setIsEditing(false);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const parts: any[] = [];

      // If we are in audio mode and it's the first time, we force transcription
      const isFirstAudioGen = activeMode === 'audio' && variations.length === 0;
      const currentStyle = isFirstAudioGen ? 'transcription' : selectedStyle;
      const currentCount = isFirstAudioGen ? 1 : variationCount;
      const currentDuration = isFirstAudioGen ? null : scriptDuration;

      if (activeMode === 'audio' && file) {
        const audioBase64 = await fileToBase64(file);
        parts.push({
          inlineData: {
            data: audioBase64,
            mimeType: file.type,
          },
        });
      }

      if (activeMode === 'image') {
        for (const img of images) {
          const imgBase64 = await fileToBase64(img);
          parts.push({
            inlineData: {
              data: imgBase64,
              mimeType: img.type,
            },
          });
        }
      }

      const stylePrompts = {
        transcription: "Provide a direct, accurate transcription or description of the content. If audio is provided, transcribe it. If only images are provided, describe the scenes and potential script for them.",
        sales: "Create a high-converting sales script based on the provided inputs. Focus on benefits and persuasion.",
        storytelling: "Create a compelling narrative or story based on the provided inputs. Use descriptive language and a clear arc.",
        emotional: "Create a script with an emotional focus based on the provided inputs. Connect with the audience's feelings."
      };

      let inputDescription = "";
      if (activeMode === 'audio') {
        inputDescription = "I have provided an audio file. Create the script based on this audio.";
      } else {
        inputDescription = "I have provided only images. Create a creative script based on the visual content of these images.";
      }

      const durationText = currentDuration ? `The script should be approximately ${currentDuration} minutes long when spoken at a normal pace.` : "";
      const customText = (activeMode === 'image' && customInstructions) ? `Additional User Instructions: ${customInstructions}` : "";

      parts.push({
        text: `Task: ${stylePrompts[currentStyle]}. 
        Context: ${inputDescription}
        ${durationText}
        ${customText}
        CRITICAL: The output script MUST be in the same language as the input audio or the primary language identified in the images. Do not translate it to English unless the input is in English.
        Generate exactly ${currentCount} different variations of this script. 
        Return the result as a JSON array of strings. 
        Each string should be one variation. 
        Do not include any other text, just the JSON array.`,
      });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });

      const result = JSON.parse(response.text);
      if (Array.isArray(result)) {
        const newVariations = result.map((content, index) => ({
          id: Date.now() + index,
          content,
          style: currentStyle
        }));
        setVariations(newVariations);
        setActiveVariationIndex(0);
      } else {
        setError('Unexpected response format. Please try again.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during generation.');
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const copyToClipboard = () => {
    if (variations[activeVariationIndex]) {
      navigator.clipboard.writeText(variations[activeVariationIndex].content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const updateActiveVariation = (newContent: string) => {
    const updated = [...variations];
    updated[activeVariationIndex].content = newContent;
    setVariations(updated);
  };

  const removeFile = () => {
    setFile(null);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.src = '';
    }
  };

  const saveToLibrary = () => {
    const current = variations[activeVariationIndex];
    if (!current) return;

    const newSaved: SavedScript = {
      id: Date.now().toString(),
      content: current.content,
      style: current.style,
      timestamp: Date.now(),
      mode: activeMode
    };

    const updated = [newSaved, ...savedScripts];
    setSavedScripts(updated);
    localStorage.setItem('script_studio_saved', JSON.stringify(updated));
  };

  const deleteFromLibrary = (id: string) => {
    const updated = savedScripts.filter(s => s.id !== id);
    setSavedScripts(updated);
    localStorage.setItem('script_studio_saved', JSON.stringify(updated));
  };

  const showOptions = activeMode === 'image' || (activeMode === 'audio' && variations.length > 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-indigo-200 shadow-lg">
                <Sparkles size={24} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Script Studio AI</h1>
            </motion.div>
            
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
              <button
                onClick={() => handleModeChange('audio')}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  activeMode === 'audio' 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <FileAudio size={16} />
                Audio To Script
              </button>
              <button
                onClick={() => handleModeChange('image')}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  activeMode === 'image' 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ImageIcon size={16} />
                Image To Script
              </button>
            </div>

            <button
              onClick={() => setShowLibrary(!showLibrary)}
              className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 border ${
                showLibrary 
                  ? 'bg-amber-500 text-white border-amber-500 shadow-md' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <History size={16} />
              Library ({savedScripts.length})
            </button>
          </div>

          <AnimatePresence>
            {showOptions && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex flex-wrap items-center gap-3"
              >
                <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                  {(['transcription', 'sales', 'storytelling', 'emotional'] as ScriptStyle[]).map((style) => (
                    <button
                      key={style}
                      onClick={() => setSelectedStyle(style)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        selectedStyle === style 
                          ? 'bg-indigo-600 text-white shadow-md' 
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                  <Layers size={14} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Variations:</span>
                  <input 
                    type="number"
                    min={1}
                    max={10}
                    value={variationCount}
                    onChange={(e) => setVariationCount(Math.min(10, Math.max(1, Number(e.target.value))))}
                    className="w-8 text-sm font-bold text-indigo-600 focus:outline-none bg-transparent"
                  />
                </div>

                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Duration (min):</span>
                  <input 
                    type="number"
                    min={1}
                    max={60}
                    placeholder="Auto"
                    value={scriptDuration || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setScriptDuration(val === '' ? null : Math.min(60, Math.max(1, Number(val))));
                    }}
                    className="w-10 text-sm font-bold text-indigo-600 focus:outline-none bg-transparent"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Inputs */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
              {activeMode === 'audio' ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Audio Input</h4>
                  {!file ? (
                    <label className="cursor-pointer block border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-all">
                      <input type="file" className="hidden" accept="audio/*" onChange={handleFileChange} />
                      <Upload size={24} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-500">Upload Voice/Audio</p>
                    </label>
                  ) : (
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                          <FileAudio size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{file.name}</p>
                        </div>
                        <button onClick={removeFile} className="text-slate-400 hover:text-red-500">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <button
                        onClick={togglePlay}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                      >
                        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                        {isPlaying ? 'Pause' : 'Play Audio'}
                      </button>
                      <audio ref={audioRef} src={URL.createObjectURL(file)} onEnded={() => setIsPlaying(false)} className="hidden" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Image Input</h4>
                    <label className="cursor-pointer text-indigo-600 hover:text-indigo-700 text-xs font-bold flex items-center gap-1">
                      <ImageIcon size={14} />
                      Add Images
                      <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageChange} />
                    </label>
                  </div>
                  
                  {images.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {images.map((img, idx) => (
                        <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-100 bg-slate-50">
                          <img src={URL.createObjectURL(img)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <button 
                            onClick={() => removeImage(idx)}
                            className="absolute top-1 right-1 p-1 bg-white/90 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-slate-300">
                      <ImageIcon size={24} className="mb-2 opacity-30" />
                      <p className="text-[10px] font-bold">No images uploaded</p>
                    </div>
                  )}
                </div>
              )}

              {activeMode === 'image' && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Script Instructions (Optional)</h4>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="Describe what kind of script you want (e.g., 'A funny script about a cat', 'A professional product review')"
                    className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none transition-all"
                  />
                </div>
              )}

              <button
                onClick={generateScripts}
                disabled={loading || (activeMode === 'audio' && !file) || (activeMode === 'image' && images.length === 0)}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Crafting...
                  </>
                ) : (
                  <>
                    <RefreshCw size={20} />
                    {activeMode === 'audio' && variations.length === 0 ? 'Generate Transcription' : 'Generate Scripts'}
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs font-medium">
                {error}
              </div>
            )}
          </div>

          {/* Right Column: Script Editor */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {variations.length > 0 ? (
                <motion.div
                  key="editor"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col h-full min-h-[600px]"
                >
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="flex bg-white p-1 rounded-lg border border-slate-200">
                        {variations.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setActiveVariationIndex(idx);
                              setIsEditing(false);
                            }}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                              activeVariationIndex === idx 
                                ? 'bg-indigo-600 text-white shadow-sm' 
                                : 'text-slate-400 hover:text-slate-600'
                            }`}
                          >
                            V{idx + 1}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-2">
                        {variations[activeVariationIndex].style}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveToLibrary}
                        className="p-2 hover:bg-amber-50 text-amber-600 rounded-xl transition-colors"
                        title="Save to Library"
                      >
                        <Bookmark size={20} />
                      </button>
                      <button
                        onClick={() => setIsEditing(!isEditing)}
                        className={`p-2 rounded-xl transition-colors ${
                          isEditing ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'
                        }`}
                      >
                        {isEditing ? <Save size={20} /> : <Edit3 size={20} />}
                      </button>
                      <button
                        onClick={copyToClipboard}
                        className="p-2 hover:bg-slate-100 text-slate-500 rounded-xl transition-colors"
                      >
                        {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 p-6 md:p-10">
                    {isEditing ? (
                      <textarea
                        value={variations[activeVariationIndex].content}
                        onChange={(e) => updateActiveVariation(e.target.value)}
                        className="w-full h-full min-h-[400px] p-0 border-none focus:ring-0 text-slate-700 text-lg leading-relaxed font-medium resize-none outline-none"
                        autoFocus
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-slate-700 text-lg leading-relaxed font-medium">
                        {variations[activeVariationIndex].content}
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-slate-100/50 border-2 border-dashed border-slate-200 rounded-3xl h-full min-h-[600px] flex flex-col items-center justify-center text-slate-400 p-10 text-center"
                >
                  <div className="p-6 bg-white rounded-full shadow-sm mb-6">
                    <FileText size={48} className="opacity-20" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-600 mb-2">Ready to Craft</h3>
                  <p className="max-w-xs text-sm">
                    {activeMode === 'audio' 
                      ? 'Upload an audio file to generate its transcription.' 
                      : 'Upload images to generate creative scripts based on them.'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Library Modal/Drawer Overlay */}
        <AnimatePresence>
          {showLibrary && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowLibrary(false)}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="text-amber-500" size={20} />
                    <h2 className="text-lg font-bold">Saved Library</h2>
                  </div>
                  <button onClick={() => setShowLibrary(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {savedScripts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
                      <Bookmark size={48} className="mb-4 opacity-10" />
                      <p className="text-sm font-medium">Your library is empty.<br/>Save scripts to see them here.</p>
                    </div>
                  ) : (
                    savedScripts.map((script) => (
                      <div key={script.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              script.mode === 'audio' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                            }`}>
                              {script.mode}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {script.style}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {new Date(script.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-4 leading-relaxed">
                          {script.content}
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(script.content);
                            }}
                            className="p-2 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg text-slate-500 transition-all"
                            title="Copy"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            onClick={() => deleteFromLibrary(script.id)}
                            className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
