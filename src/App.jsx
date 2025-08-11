import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [lunchMeals, setLunchMeals] = useState(Array(10).fill(''))
  const [supperMeals, setSupperMeals] = useState(Array(10).fill(''))
  const [weeklyPlan, setWeeklyPlan] = useState([])
  const [isPlanGenerated, setIsPlanGenerated] = useState(false)
  const [activeTab, setActiveTab] = useState('meals') // 'meals' or 'plan'
  const [lastSaved, setLastSaved] = useState(null)
  const [storageStatus, setStorageStatus] = useState('checking')
  const [storageMode, setStorageMode] = useState('checking') // 'opfs' | 'local' | 'unavailable'
  const [mealIngredients, setMealIngredients] = useState({}) // { [mealName]: string[] }
  const [weeklyShoppingList, setWeeklyShoppingList] = useState([]) // [{ name, count }]
  const [ingredientInputs, setIngredientInputs] = useState({}) // transient text values per meal

  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  // Feature detection for Origin Private File System (OPFS)
  const isOPFSAvailable = () => {
    return typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
  }

  // Test if localStorage is available (fallback)
  const isLocalStorageAvailable = () => {
    try {
      const test = 'test'
      localStorage.setItem(test, test)
      localStorage.removeItem(test)
      return true
    } catch (e) {
      return false
    }
  }

  // --- File storage helpers (OPFS) ---
  const getMealsFileHandle = async (createIfMissing = true) => {
    const rootDir = await navigator.storage.getDirectory()
    try {
      return await rootDir.getFileHandle('meals.json', { create: createIfMissing })
    } catch (error) {
      // If file missing and we chose not to create, return null
      if (!createIfMissing) return null
      throw error
    }
  }

  const readMealsFromFile = async () => {
    try {
      const handle = await getMealsFileHandle(false)
      if (!handle) return null
      const file = await handle.getFile()
      const text = await file.text()
      if (!text || text.trim() === '') return null
      return JSON.parse(text)
    } catch (error) {
      console.error('❌ Error reading meals.json from OPFS:', error)
      return null
    }
  }

  const writeMealsToFile = async (lunchArray, supperArray, ingredientsMap) => {
    try {
      const handle = await getMealsFileHandle(true)
      const writable = await handle.createWritable()
      const mealData = {
        lunchMeals: lunchArray,
        supperMeals: supperArray,
        mealIngredients: ingredientsMap || {},
        exportDate: new Date().toISOString(),
        version: '1.0'
      }
      await writable.write(JSON.stringify(mealData, null, 2))
      await writable.close()
      setStorageStatus('working')
      setStorageMode('opfs')
      setLastSaved(new Date())
    } catch (error) {
      console.error('❌ Error writing meals.json to OPFS:', error)
      throw error
    }
  }

  const eraseMealsFile = async () => {
    try {
      const rootDir = await navigator.storage.getDirectory()
      await rootDir.removeEntry('meals.json', { recursive: false })
    } catch (error) {
      // If it doesn't exist, ignore
      if (error && error.name !== 'NotFoundError') {
        console.warn('⚠️ Could not remove meals.json, will overwrite instead:', error)
      }
    }
  }

  // Load saved meals on component mount (prefer OPFS file, fallback to localStorage)
  useEffect(() => {
    ;(async () => {
      // Try OPFS first
      if (isOPFSAvailable()) {
        try {
          const fileData = await readMealsFromFile()
          if (fileData && Array.isArray(fileData.lunchMeals) && Array.isArray(fileData.supperMeals)) {
            setLunchMeals(fileData.lunchMeals)
            setSupperMeals(fileData.supperMeals)
            if (fileData.mealIngredients && typeof fileData.mealIngredients === 'object') {
              setMealIngredients(fileData.mealIngredients)
            }
            console.log('✅ Loaded meals from OPFS file meals.json')
          } else {
            // Initialize file with current (empty) state if not present
            await writeMealsToFile(lunchMeals, supperMeals, mealIngredients)
            console.log('ℹ️ Initialized OPFS meals.json with default state')
          }
          setStorageStatus('working')
          setStorageMode('opfs')
          return
        } catch (error) {
          console.error('❌ OPFS load failed, falling back to localStorage:', error)
        }
      }

      // Fallback to localStorage
      if (!isLocalStorageAvailable()) {
        setStorageStatus('unavailable')
        setStorageMode('unavailable')
        console.error('Neither OPFS nor localStorage are available')
        return
      }

      try {
        const savedLunchMeals = localStorage.getItem('mealPlanner_lunchMeals')
        const savedSupperMeals = localStorage.getItem('mealPlanner_supperMeals')
        const savedLastSaved = localStorage.getItem('mealPlanner_lastSaved')
        const savedMealIngredients = localStorage.getItem('mealPlanner_mealIngredients')

        if (savedLunchMeals) {
          const parsedLunchMeals = JSON.parse(savedLunchMeals)
          setLunchMeals(parsedLunchMeals)
          console.log('✅ Loaded lunch meals (localStorage):', parsedLunchMeals)
        }
        if (savedSupperMeals) {
          const parsedSupperMeals = JSON.parse(savedSupperMeals)
          setSupperMeals(parsedSupperMeals)
          console.log('✅ Loaded supper meals (localStorage):', parsedSupperMeals)
        }
        if (savedLastSaved) {
          setLastSaved(JSON.parse(savedLastSaved))
        }
        if (savedMealIngredients) {
          try {
            const parsedIngredients = JSON.parse(savedMealIngredients)
            if (parsedIngredients && typeof parsedIngredients === 'object') {
              setMealIngredients(parsedIngredients)
              console.log('✅ Loaded meal ingredients (localStorage)')
            }
          } catch {}
        }

        setStorageStatus('working')
        setStorageMode('local')
        console.log('✅ localStorage is working properly (fallback)')
      } catch (error) {
        console.error('❌ Error loading saved meals from localStorage:', error)
        setStorageStatus('error')
        setStorageMode('local')
      }
    })()
  }, [])

  // Persist meals whenever they change (prefer OPFS file, fallback to localStorage)
  useEffect(() => {
    const persist = async () => {
      // Avoid persisting while initial check is happening
      if (storageStatus === 'unavailable') return

      if (isOPFSAvailable()) {
        try {
          await writeMealsToFile(lunchMeals, supperMeals, mealIngredients)
          console.log('💾 Saved meals to OPFS file meals.json')
          return
        } catch (error) {
          console.error('❌ Failed to save to OPFS, will try localStorage fallback:', error)
        }
      }

      if (isLocalStorageAvailable()) {
        try {
          localStorage.setItem('mealPlanner_lunchMeals', JSON.stringify(lunchMeals))
          localStorage.setItem('mealPlanner_supperMeals', JSON.stringify(supperMeals))
          localStorage.setItem('mealPlanner_mealIngredients', JSON.stringify(mealIngredients))
          const now = new Date()
          setLastSaved(now)
          localStorage.setItem('mealPlanner_lastSaved', JSON.stringify(now))
          console.log('💾 Saved meals to localStorage (fallback)')
          setStorageStatus('working')
          setStorageMode('local')
        } catch (error) {
          console.error('❌ Error saving meals to localStorage:', error)
          setStorageStatus('error')
        }
      }
    }

    persist()
  }, [lunchMeals, supperMeals, mealIngredients])

  const handleLunchMealChange = (index, value) => {
    const previousName = lunchMeals[index]
    const newLunchMeals = [...lunchMeals]
    newLunchMeals[index] = value
    setLunchMeals(newLunchMeals)
    // If meal was renamed, carry over ingredients if target is empty
    if (previousName && previousName !== value) {
      setMealIngredients((prev) => {
        if (prev[previousName] && value && !prev[value]) {
          const updated = { ...prev, [value]: prev[previousName] }
          delete updated[previousName]
          return updated
        }
        return prev
      })
      // Carry over in-progress ingredient input text as well
      setIngredientInputs((prev) => {
        if (prev[previousName] && value && !prev[value]) {
          const updated = { ...prev, [value]: prev[previousName] }
          delete updated[previousName]
          return updated
        }
        return prev
      })
    }
    console.log(`📝 Updated lunch meal ${index + 1}:`, value)
  }

  const handleSupperMealChange = (index, value) => {
    const previousName = supperMeals[index]
    const newSupperMeals = [...supperMeals]
    newSupperMeals[index] = value
    setSupperMeals(newSupperMeals)
    // If meal was renamed, carry over ingredients if target is empty
    if (previousName && previousName !== value) {
      setMealIngredients((prev) => {
        if (prev[previousName] && value && !prev[value]) {
          const updated = { ...prev, [value]: prev[previousName] }
          delete updated[previousName]
          return updated
        }
        return prev
      })
      // Carry over in-progress ingredient input text as well
      setIngredientInputs((prev) => {
        if (prev[previousName] && value && !prev[value]) {
          const updated = { ...prev, [value]: prev[previousName] }
          delete updated[previousName]
          return updated
        }
        return prev
      })
    }
    console.log(`📝 Updated supper meal ${index + 1}:`, value)
  }

  const shuffleArray = (array) => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  const generateWeeklyPlan = () => {
    // Filter out empty meals
    const validLunchMeals = lunchMeals.filter(meal => meal.trim() !== '')
    const validSupperMeals = supperMeals.filter(meal => meal.trim() !== '')

    if (validLunchMeals.length === 0 || validSupperMeals.length === 0) {
      alert('Please enter at least one meal for both lunch and supper!')
      return
    }

    // Shuffle the meals
    const shuffledLunchMeals = shuffleArray(validLunchMeals)
    const shuffledSupperMeals = shuffleArray(validSupperMeals)

    // Create weekly plan
    const plan = weekdays.map((day, index) => ({
      day,
      lunch: shuffledLunchMeals[index % shuffledLunchMeals.length],
      supper: shuffledSupperMeals[index % shuffledSupperMeals.length]
    }))

    setWeeklyPlan(plan)
    setIsPlanGenerated(true)
    setActiveTab('plan')

    // Build shopping list from plan using mealIngredients map
    const counts = {}
    plan.forEach(({ lunch, supper }) => {
      const addItems = (name) => {
        const items = mealIngredients[name] || []
        items.forEach((raw) => {
          const item = String(raw || '').trim()
          if (!item) return
          const key = item.toLowerCase()
          counts[key] = (counts[key] || 0) + 1
        })
      }
      addItems(lunch)
      addItems(supper)
    })
    const shopping = Object.keys(counts)
      .sort()
      .map((k) => ({ name: k, count: counts[k] }))
    setWeeklyShoppingList(shopping)
  }

  const clearPlan = () => {
    setWeeklyPlan([])
    setIsPlanGenerated(false)
  }

  const clearAllMeals = () => {
    setLunchMeals(Array(10).fill(''))
    setSupperMeals(Array(10).fill(''))
    setMealIngredients({})
    setIngredientInputs({})
    clearPlan()
    // Erase file storage (OPFS) and fallback storage only when user explicitly clears
    if (isOPFSAvailable()) {
      eraseMealsFile().catch(() => {
        // If removal fails, just overwrite with empty state
        writeMealsToFile(Array(10).fill(''), Array(10).fill(''), {}).catch(() => {})
      })
    }
    if (isLocalStorageAvailable()) {
      localStorage.removeItem('mealPlanner_lunchMeals')
      localStorage.removeItem('mealPlanner_supperMeals')
      localStorage.removeItem('mealPlanner_lastSaved')
      localStorage.removeItem('mealPlanner_mealIngredients')
    }
    setLastSaved(null)
  }

  const getValidMealCount = (meals) => {
    return meals.filter(meal => meal.trim() !== '').length
  }

  // Export meals to JSON file
  const exportMeals = () => {
    const mealData = {
      lunchMeals: lunchMeals,
      supperMeals: supperMeals,
      mealIngredients: mealIngredients,
      exportDate: new Date().toISOString(),
      version: '1.0'
    }
    
    const dataStr = JSON.stringify(mealData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    
    const link = document.createElement('a')
    link.href = URL.createObjectURL(dataBlob)
    link.download = `meal-planner-data-${new Date().toISOString().split('T')[0]}.json`
    link.click()
  }

  // Import meals from JSON file
  const importMeals = (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        
        if (data.lunchMeals && data.supperMeals) {
          setLunchMeals(data.lunchMeals)
          setSupperMeals(data.supperMeals)
          if (data.mealIngredients && typeof data.mealIngredients === 'object') {
            setMealIngredients(data.mealIngredients)
          }
          alert('Meals imported successfully!')
        } else {
          alert('Invalid file format. Please use a valid meal planner export file.')
        }
      } catch (error) {
        alert('Error reading file. Please make sure it\'s a valid JSON file.')
      }
    }
    reader.readAsText(file)
    
    // Reset file input
    event.target.value = ''
  }

  const formatLastSaved = () => {
    if (!lastSaved) return 'Never'
    return new Date(lastSaved).toLocaleString()
  }

  // Test function to verify storage is working
  const testLocalStorage = () => {
    console.log('🔍 === localStorage Debug Info ===')
    console.log('localStorage available:', isLocalStorageAvailable())
    console.log('Storage status:', storageStatus)
    console.log('Storage mode:', storageMode)
    console.log('OPFS available:', isOPFSAvailable())
    console.log('Current localStorage contents:')
    console.log('lunchMeals:', localStorage.getItem('mealPlanner_lunchMeals'))
    console.log('supperMeals:', localStorage.getItem('mealPlanner_supperMeals'))
    console.log('lastSaved:', localStorage.getItem('mealPlanner_lastSaved'))
    console.log('mealIngredients:', localStorage.getItem('mealPlanner_mealIngredients'))
    console.log('Current state:')
    console.log('lunchMeals state:', lunchMeals)
    console.log('supperMeals state:', supperMeals)
    console.log('mealIngredients state:', mealIngredients)
    console.log('================================')
  }

  // Helpers for ingredients editing UI
  const getIngredientsCSV = (mealName) => {
    const items = mealIngredients[mealName] || []
    return items.join(', ')
  }

  const updateIngredientsFromCSV = (mealName, csv) => {
    const name = (mealName || '').trim()
    if (!name) return
    const items = csv
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    setMealIngredients((prev) => ({ ...prev, [name]: items }))
  }

  // Ingredient input helpers to avoid reformatting while typing
  const getIngredientsInputValue = (mealName) => {
    const name = (mealName || '').trim()
    if (!name) return ''
    return Object.prototype.hasOwnProperty.call(ingredientInputs, name)
      ? ingredientInputs[name]
      : getIngredientsCSV(name)
  }

  const handleIngredientsChange = (mealName, text) => {
    const name = (mealName || '').trim()
    if (!name) return
    setIngredientInputs((prev) => ({ ...prev, [name]: text }))
  }

  const commitIngredientsFromInput = (mealName) => {
    const name = (mealName || '').trim()
    if (!name) return
    const raw = ingredientInputs[name]
    if (typeof raw === 'string') {
      updateIngredientsFromCSV(name, raw)
    }
    setIngredientInputs((prev) => {
      const updated = { ...prev }
      delete updated[name]
      return updated
    })
  }

  const getStorageStatusText = () => {
    switch (storageStatus) {
      case 'working':
        return ''
      case 'error':
        return '❌ Storage error'
      case 'unavailable':
        return '❌ Storage unavailable'
      default:
        return '⏳ Checking storage...'
    }
  }

  return (
    <div className="meal-planner">
      <header className="header">
        <div className="header-content">
          <h1>🍽️ Professional Meal Planner</h1>
          <p>Plan and randomize your weekly lunch and supper meals</p>
          <div className="meal-stats">
            <span className="stat">
              <span className="stat-number">{getValidMealCount(lunchMeals)}</span>
              <span className="stat-label">Lunch Meals</span>
            </span>
            <span className="stat">
              <span className="stat-number">{getValidMealCount(supperMeals)}</span>
              <span className="stat-label">Supper Meals</span>
            </span>
          </div>
          <div className="last-saved">
            <br />
            <span className="storage-status">{getStorageStatusText()}</span>
          </div>
        </div>
      </header>

      <div className="container">
        <div className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'meals' ? 'active' : ''}`}
            onClick={() => setActiveTab('meals')}
          >
            📝 Manage Meals
          </button>
          {isPlanGenerated && (
            <button 
              className={`tab-btn ${activeTab === 'plan' ? 'active' : ''}`}
              onClick={() => setActiveTab('plan')}
            >
              📅 Weekly Plan
            </button>
          )}
        </div>

        {activeTab === 'meals' && (
          <div className="meals-section">
            <div className="meal-inputs">
              <div className="meal-group">
                <div className="meal-group-header">
                  <h2>🍳 Lunch Meals</h2>
                  <span className="meal-count">{getValidMealCount(lunchMeals)}/10</span>
                </div>
                <div className="meal-inputs-grid">
                  {lunchMeals.map((meal, index) => (
                    <div key={index} className="meal-input">
                      <label htmlFor={`lunch-${index}`}>Meal {index + 1}:</label>
                      <input
                        id={`lunch-${index}`}
                        type="text"
                        value={meal}
                        onChange={(e) => handleLunchMealChange(index, e.target.value)}
                        placeholder={`Enter lunch meal ${index + 1}`}
                        className={meal.trim() !== '' ? 'filled' : ''}
                      />
                      <input
                        type="text"
                        value={getIngredientsInputValue(meal)}
                        onChange={(e) => handleIngredientsChange(meal, e.target.value)}
                        onBlur={() => commitIngredientsFromInput(meal)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur()
                          }
                        }}
                        placeholder={meal.trim() ? 'Ingredients (comma-separated): e.g., chicken, rice, broccoli' : 'Add a meal name to edit ingredients'}
                        disabled={!meal.trim()}
                        style={{ marginTop: '6px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="meal-group">
                <div className="meal-group-header">
                  <h2>🍽️ Supper Meals</h2>
                  <span className="meal-count">{getValidMealCount(supperMeals)}/10</span>
                </div>
                <div className="meal-inputs-grid">
                  {supperMeals.map((meal, index) => (
                    <div key={index} className="meal-input">
                      <label htmlFor={`supper-${index}`}>Meal {index + 1}:</label>
                      <input
                        id={`supper-${index}`}
                        type="text"
                        value={meal}
                        onChange={(e) => handleSupperMealChange(index, e.target.value)}
                        placeholder={`Enter supper meal ${index + 1}`}
                        className={meal.trim() !== '' ? 'filled' : ''}
                      />
                      <input
                        type="text"
                        value={getIngredientsInputValue(meal)}
                        onChange={(e) => handleIngredientsChange(meal, e.target.value)}
                        onBlur={() => commitIngredientsFromInput(meal)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur()
                          }
                        }}
                        placeholder={meal.trim() ? 'Ingredients (comma-separated): e.g., beef, onions, noodles' : 'Add a meal name to edit ingredients'}
                        disabled={!meal.trim()}
                        style={{ marginTop: '6px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="actions">
              <button 
                className="btn btn-primary" 
                onClick={generateWeeklyPlan}
                disabled={getValidMealCount(lunchMeals) === 0 || getValidMealCount(supperMeals) === 0}
              >
                🎲 Generate Weekly Plan
              </button>
              <button className="btn btn-secondary" onClick={clearPlan}>
                🗑️ Clear Plan
              </button>
              <button className="btn btn-danger" onClick={clearAllMeals}>
                🗑️ Clear All Meals
              </button>
            </div>

            <div className="data-actions">
              <div className="data-action-group">
                <button className="btn btn-export" onClick={exportMeals}>
                  💾 Export Meals
                </button>
                <label className="btn btn-import">
                  📁 Import Meals
                  <input
                    type="file"
                    accept=".json"
                    onChange={importMeals}
                    style={{ display: 'none' }}
                  />
                </label>
                <button className="btn btn-secondary" onClick={testLocalStorage}>
                  🔍 Debug Storage
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'plan' && isPlanGenerated && (
          <div className="weekly-plan">
            <div className="plan-header">
              <h2>📅 This Week's Meal Plan</h2>
              <button className="btn btn-secondary" onClick={() => setActiveTab('meals')}>
                ← Back to Meals
              </button>
            </div>
            <div className="plan-grid">
              {weeklyPlan.map((day, index) => (
                <div key={index} className="day-card">
                  <h3 className="day-title">{day.day}</h3>
                  <div className="meals">
                    <div className="meal lunch">
                      <span className="meal-label">🍳 Lunch:</span>
                      <span className="meal-text">{day.lunch}</span>
                    </div>
                    <div className="meal supper">
                      <span className="meal-label">🍽️ Supper:</span>
                      <span className="meal-text">{day.supper}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="plan-actions">
              <button className="btn btn-primary" onClick={generateWeeklyPlan}>
                🔄 Regenerate Plan
              </button>
            </div>
            {weeklyShoppingList.length > 0 && (
              <div className="weekly-plan" style={{ marginTop: '20px' }}>
                <div className="plan-header">
                  <h2>🛒 Weekly Shopping List</h2>
                </div>
                <ul style={{ textAlign: 'left', columns: 2, columnGap: '30px', paddingLeft: '18px' }}>
                  {weeklyShoppingList.map((item, idx) => (
                    <li key={idx} style={{ breakInside: 'avoid' }}>
                      {item.name}{item.count > 1 ? ` ×${item.count}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
