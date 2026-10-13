import { useEffect, useMemo, useRef, useState } from 'react'

import {

  Activity, ArrowDownRight, ArrowUpRight, Bell, Boxes, Check, ChevronDown,

  CircleHelp, Clock3, Command, Cpu, Download, Ellipsis, Filter, Gauge,

  GitBranch, LayoutDashboard, ListFilter, Menu, Plus, Search, Settings2,

  ShieldCheck, Sparkles, TerminalSquare, Workflow, X, Zap, Copy,

} from 'lucide-react'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')

function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem('devmesh_token')
  const headers = new Headers(options.headers ?? {})
  if (token) headers.set('Authorization', `Bearer ${token}`)

  return fetch(url, { ...options, headers }).then(response => {
    if (
      response.status === 401 &&
      token &&
      !String(url).includes('/api/v1/auth/me')
    ) {
      sessionStorage.removeItem('devmesh_token')
      window.dispatchEvent(new Event('devmesh:unauthenticated'))
    }
    return response
  })
}



// const initialJobs = [

//   { id: 'job_8f31a2', name: 'Process customer exports', type: 'file.process', status: 'Running', duration: '00:12', submitted: '2 min ago', priority: 'High' },

//   { id: 'job_7c90bd', name: 'Generate weekly report', type: 'report.generate', status: 'Queued', duration: '—', submitted: '4 min ago', priority: 'Normal' },

//   { id: 'job_61ab42', name: 'Sync product catalog', type: 'catalog.sync', status: 'Completed', duration: '00:08', submitted: '8 min ago', priority: 'Normal' },

//   { id: 'job_4de109', name: 'Send notification batch', type: 'notification.send', status: 'Failed', duration: '00:03', submitted: '12 min ago', priority: 'Low' },

//   { id: 'job_3ab7f0', name: 'Rebuild search index', type: 'search.reindex', status: 'Completed', duration: '00:42', submitted: '19 min ago', priority: 'High' },

// ]
const initialJobs = []

const statusClass = {
  Running: 'running',
  Queued: 'queued',
  Retrying: 'queued',
  Completed: 'completed',
  Failed: 'failed',
  Cancelled: 'failed',
}


function App() {
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('devmesh_token') ?? '')
  const [authUser, setAuthUser] = useState(null)
  const [authChecking, setAuthChecking] = useState(() => Boolean(sessionStorage.getItem('devmesh_token')))
  const [authMode, setAuthMode] = useState('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authDisplayName, setAuthDisplayName] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [jobs, setJobs] = useState(initialJobs)
  const [metrics, setMetrics] = useState(null)
  const [health, setHealth] = useState(null)
  const [healthError, setHealthError] = useState('')
  const [healthCheckVersion, setHealthCheckVersion] = useState(0)
  const [executionEvents, setExecutionEvents] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [loadingWorkflows, setLoadingWorkflows] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [projectId, setProjectId] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)
  const inputInitializedFor = useRef(null)
  const [editedJobPayload, setEditedJobPayload] = useState('')
const [savingJobInput, setSavingJobInput] = useState(false)
  const [jobDetails, setJobDetails] = useState(null)
  const [loadingJobDetails, setLoadingJobDetails] = useState(false)
  const [activeNav, setActiveNav] = useState('Overview')


useEffect(() => {
  function handleUnauthenticated() {
    setAuthToken('')
    setAuthUser(null)
    setProjectId('')
    setSelectedJob(null)
    setJobDetails(null)
  }

  window.addEventListener('devmesh:unauthenticated', handleUnauthenticated)
  return () => window.removeEventListener('devmesh:unauthenticated', handleUnauthenticated)
}, [])

useEffect(() => {
  if (!authToken) {
    setAuthUser(null)
    setAuthChecking(false)
    return
  }

  let cancelled = false
  setAuthChecking(true)
  async function loadCurrentUser() {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/v1/auth/me`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message || 'Session expired')
      if (!cancelled) setAuthUser(result.data)
    } catch {
      if (!cancelled) {
        sessionStorage.removeItem('devmesh_token')
        setAuthToken('')
        setAuthUser(null)
      }
    } finally {
      if (!cancelled) setAuthChecking(false)
    }
  }

  void loadCurrentUser()
  return () => { cancelled = true }
}, [authToken])

useEffect(() => {
  if (!authToken) return
  let cancelled = false

  async function loadProjects() {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/v1/projects`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load projects')
      const result = await response.json()
      if (!cancelled) setProjectId(result.data[0]?.id ?? '')
    } catch (error) {
      console.error('Failed to load projects:', error)
      if (!cancelled) setProjectId('')
    }
  }

  void loadProjects()
  return () => { cancelled = true }
}, [authToken])

useEffect(() => {
  if (!authToken) return
  let cancelled = false

  async function loadJobs() {
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/v1/jobs`,
      )

      if (!response.ok) {
        throw new Error('Could not load jobs')
      }

      const result = await response.json()

      const formattedJobs = result.data.map(job => {
        const startedAt = job.startedAt
          ? new Date(job.startedAt)
          : null

        const completedAt = job.completedAt
          ? new Date(job.completedAt)
          : null

        let duration = '—'

        if (startedAt && completedAt) {
          const seconds =
            (completedAt.getTime() - startedAt.getTime()) / 1000

          duration = `${seconds.toFixed(2)}s`
        } else if (startedAt) {
          duration = 'In progress'
        }

        const statusLabels = {
          QUEUED: 'Queued',
          RUNNING: 'Running',
          RETRYING: 'Retrying',
          COMPLETED: 'Completed',
          FAILED: 'Failed',
          CANCELLED: 'Cancelled',
        }

        return {
          id: job.id,
          name: job.name,
          type: job.type,
          status: statusLabels[job.status] ?? job.status,
          duration,
          submitted: new Date(job.createdAt).toLocaleString(),
          priority:
            job.priority.charAt(0) +
            job.priority.slice(1).toLowerCase(),
        }
      })

      if (!cancelled) {
        setJobs(formattedJobs)
      }
    } catch (error) {
      console.error('Failed to refresh jobs:', error)
    } finally {
      if (!cancelled) {
        setLoadingJobs(false)
      }
    }
  }

  loadJobs()

  const refreshInterval = window.setInterval(loadJobs, 3000)

  return () => {
    cancelled = true
    window.clearInterval(refreshInterval)
  }
}, [authToken])

// Refresh metrics from the API.
useEffect(() => {
  if (!authToken) return
  let cancelled = false

  async function loadMetrics() {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/v1/metrics`, {
        cache: 'no-store',
      })

      if (!response.ok) throw new Error('Could not load system metrics')
      const result = await response.json()

      if (!cancelled) setMetrics(result.data)
    } catch (error) {
      console.error('Failed to refresh system metrics:', error)
    }
  }

  void loadMetrics()
  const intervalId = window.setInterval(loadMetrics, 5000)

  return () => {
    cancelled = true
    window.clearInterval(intervalId)
  }
}, [authToken])

// Fetch workflow templates for the selected project.
useEffect(() => {
  if (!authToken || activeNav !== 'Workflows' || !projectId) return

  let cancelled = false

  async function loadWorkflows() {
    setLoadingWorkflows(true)
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/v1/workflows?projectId=${encodeURIComponent(projectId)}`,
        { cache: 'no-store' },
      )
      if (!response.ok) throw new Error('Could not load workflow templates')
      const result = await response.json()
      if (!cancelled) setWorkflows(result.data)
    } catch (error) {
      console.error('Failed to load workflow templates:', error)
      if (!cancelled) setWorkflows([])
    } finally {
      if (!cancelled) setLoadingWorkflows(false)
    }
  }

  void loadWorkflows()
  return () => { cancelled = true }
}, [activeNav, projectId, authToken])

// Load the event feed only while the execution logs page is open.
// Keep the system banner tied to the actual API readiness check.
useEffect(() => {
  let cancelled = false

  async function loadHealth() {
    try {
      const response = await apiFetch(`${API_BASE_URL}/health`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || result.status !== 'ok') {
        throw new Error(result.message || `Health check failed (HTTP ${response.status})`)
      }
      if (!cancelled) {
        setHealth(true)
        setHealthError('')
      }
    } catch (error) {
      if (!cancelled) {
        setHealth(false)
        setHealthError(error instanceof Error ? error.message : 'Unable to reach the API')
      }
    }
  }

  void loadHealth()
  const intervalId = window.setInterval(loadHealth, 10000)
  return () => {
    cancelled = true
    window.clearInterval(intervalId)
  }
}, [healthCheckVersion])

useEffect(() => {
  if (!authToken || activeNav !== 'Execution logs') return

  let cancelled = false

  async function loadExecutionEvents() {
    setLoadingEvents(true)
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/v1/events?limit=100`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Could not load execution events')
      const result = await response.json()
      if (!cancelled) setExecutionEvents(result.data)
    } catch (error) {
      console.error('Failed to load execution events:', error)
      if (!cancelled) setExecutionEvents([])
    } finally {
      if (!cancelled) setLoadingEvents(false)
    }
  }

  void loadExecutionEvents()
  const intervalId = window.setInterval(loadExecutionEvents, 5000)
  return () => {
    cancelled = true
    window.clearInterval(intervalId)
  }
}, [activeNav, authToken])

// Load and refresh details for the selected job.
useEffect(() => {
  if (!authToken || !selectedJob?.id) return

  let cancelled = false

  async function loadJobDetails() {
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/v1/jobs/${selectedJob.id}`,
        { cache: 'no-store' }
      )

      if (!response.ok) {
        throw new Error('Could not load job details')
      }

      const result = await response.json()

      if (!cancelled) {
  setJobDetails(result.data)

  if (inputInitializedFor.current !== result.data.id) {
    setEditedJobPayload(
      JSON.stringify(result.data.payload ?? {}, null, 2)
    )

    inputInitializedFor.current = result.data.id
  }
}
    } catch (error) {
      console.error('Failed to load job details:', error)
    } finally {
      if (!cancelled) {
        setLoadingJobDetails(false)
      }
    }
  }

  setLoadingJobDetails(true)
  loadJobDetails()

  const intervalId = window.setInterval(loadJobDetails, 3000)

  return () => {
    cancelled = true
    window.clearInterval(intervalId)
  }
}, [selectedJob?.id, authToken])





  const [search, setSearch] = useState('')

  const [statusFilter, setStatusFilter] = useState('All statuses')

  const [showCreate, setShowCreate] = useState(false)
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false)
  const [workflowName, setWorkflowName] = useState('')
  const [workflowDescription, setWorkflowDescription] = useState('')
  const [workflowSteps, setWorkflowSteps] = useState(`[
  {
    "name": "Prepare input",
    "type": "file.process",
    "payload": { "text": "Prepare this sample input" }
  },
  {
    "name": "Generate report",
    "type": "report.generate",
    "payload": {
      "records": [
        { "name": "Ada", "score": 95 },
        { "name": "Lin", "score": 88 }
      ]
    }
  }
]`)

  const [jobName, setJobName] = useState('')

  const [jobType, setJobType] = useState('file.process')
  const [jobDependencies, setJobDependencies] = useState('')
  const [jobPayload, setJobPayload] = useState(`{\n  "text": "Hello from DevMesh"\n}`)

  const [toast, setToast] = useState('')

  const [sidebarOpen, setSidebarOpen] = useState(false)



  const filteredJobs = useMemo(() => jobs.filter(job => {

    const matchesSearch = `${job.name} ${job.id} ${job.type}`.toLowerCase().includes(search.toLowerCase())

    return matchesSearch && (statusFilter === 'All statuses' || job.status === statusFilter)

  }), [jobs, search, statusFilter])



  function notify(message) {

    setToast(message)

    window.setTimeout(() => setToast(''), 2800)

  }
async function createJob(event) {
  event.preventDefault()

  if (!jobName.trim()) return
  if (!projectId) {
    notify('No project is available. Run npm run db:seed, then restart the API.')
    return
  }

  let parsedPayload
  try {
    parsedPayload = JSON.parse(jobPayload)
  } catch {
    notify('Input must be valid JSON')
    return
  }

  if (
    parsedPayload === null ||
    typeof parsedPayload !== 'object' ||
    Array.isArray(parsedPayload)
  ) {
    notify('Input JSON must be an object')
    return
  }

  try {
    const response = await apiFetch(`${API_BASE_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: jobName.trim(),
        type: jobType,
        projectId,
        payload: parsedPayload,
        dependsOn: jobDependencies.split(',').map(id => id.trim()).filter(Boolean),
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Could not create job')
    }

    const job = result.data

    setJobs(current => [
      {
        id: job.id,
        name: job.name,
        type: job.type,
        status: 'Queued',
        duration: '—',
        submitted: 'Just now',
        priority:
          job.priority.charAt(0) + job.priority.slice(1).toLowerCase(),
      },
      ...current,
    ])

    setJobName('')
    setJobDependencies('')
    setJobPayload(`{\n  "text": "Hello from DevMesh"\n}`)
    setShowCreate(false)
    setActiveNav('Jobs')
    notify('Job saved successfully')
  } catch (error) {
    console.error('Create job failed:', error)
    notify(error.message || 'Could not create job')
  }
}




async function createWorkflow(event) {
  event.preventDefault()
  if (!projectId) {
    notify('No project is available. Run npm run db:seed, then restart the API.')
    return
  }

  let steps
  try {
    steps = JSON.parse(workflowSteps)
  } catch {
    notify('Workflow steps must be valid JSON')
    return
  }

  if (!Array.isArray(steps)) {
    notify('Workflow steps must be a JSON array')
    return
  }

  try {
    const response = await apiFetch(`${API_BASE_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: workflowName.trim(),
        description: workflowDescription.trim(),
        projectId,
        steps,
      }),
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error?.message || 'Could not save workflow')
    }

    setWorkflows(current => [result.data, ...current])
    setWorkflowName('')
    setWorkflowDescription('')
    setShowCreateWorkflow(false)
    notify('Workflow template saved')
  } catch (error) {
    console.error('Create workflow failed:', error)
    notify(error.message || 'Could not save workflow')
  }
}

async function runWorkflow(workflowId) {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/v1/workflows/${workflowId}/run`, {
      method: 'POST',
    })
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error?.message || 'Could not run workflow')
    }

    notify(`Workflow started with ${result.data.jobs.length} dependent jobs`)
    setActiveNav('Jobs')
  } catch (error) {
    console.error('Run workflow failed:', error)
    notify(error.message || 'Could not run workflow')
  }
}

  const navGroups = [

    { label: 'WORKSPACE', items: [

      { name: 'Overview', icon: LayoutDashboard },

      { name: 'Jobs', icon: Boxes, count: String(jobs.length).padStart(2, '0') },

      { name: 'Workflows', icon: Workflow },

      { name: 'Workers', icon: Cpu },

    ]},

    { label: 'OBSERVABILITY', items: [

      { name: 'Monitoring', icon: Activity },

      { name: 'Execution logs', icon: TerminalSquare },

    ]},

  ]



  async function submitAuth(event) {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          ...(authMode === 'register' ? { displayName: authDisplayName } : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message || 'Unable to authenticate')

      sessionStorage.setItem('devmesh_token', result.data.token)
      setAuthToken(result.data.token)
      setAuthUser(result.data.user)
      setAuthChecking(true)
      setAuthPassword('')
      setProjectId('')
    } catch (error) {
      setAuthError(error.message || 'Unable to authenticate')
    } finally {
      setAuthLoading(false)
    }
  }

  function signOut() {
    sessionStorage.removeItem('devmesh_token')
    setAuthToken('')
    setAuthUser(null)
    setAuthChecking(false)
    setJobs([])
    setMetrics(null)
    setProjectId('')
    setSelectedJob(null)
    setJobDetails(null)
    setWorkflows([])
    setExecutionEvents([])
  }

  if (authChecking) {
    return <main className="auth-screen"><p className="auth-description">Checking your session…</p></main>
  }

  if (!authToken || !authUser) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="auth-brand"><span className="auth-brand-mark"><Workflow size={22} /></span><span>devmesh<span className="brand-period">.</span></span></div>
          <p className="auth-eyebrow">DISTRIBUTED JOB ORCHESTRATION</p>
          <h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="auth-description">{authMode === 'login' ? 'Sign in to manage your jobs and workflows.' : 'Create a secure workspace for your background jobs.'}</p>
          <form onSubmit={submitAuth}>
            {authMode === 'register' && (
              <label className="auth-label">
                Display name
                <input autoComplete="name" value={authDisplayName} onChange={event => setAuthDisplayName(event.target.value)} required minLength={1} maxLength={80} placeholder="Your name" />
              </label>
            )}
            <label className="auth-label">
              Email address
              <input type="email" autoComplete="email" value={authEmail} onChange={event => setAuthEmail(event.target.value)} required maxLength={254} placeholder="you@example.com" />
            </label>
            <label className="auth-label">
              Password
              <input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={authPassword} onChange={event => setAuthPassword(event.target.value)} required minLength={authMode === 'register' ? 12 : 1} maxLength={128} placeholder={authMode === 'register' ? 'At least 12 characters' : 'Your password'} />
            </label>
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            <button type="submit" className="primary-button auth-submit" disabled={authLoading}>
              {authLoading ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <p className="auth-switch">
            {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            {' '}
            <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError('') }}>
              {authMode === 'login' ? 'Create account' : 'Sign in'}
            </button>
          </p>
          <p className="auth-footnote">Your projects and job history are private to your account.</p>
        </section>
      </main>
    )
  }

  return (

    <div className="app-shell">

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>

        <div className="brand">

          <div className="brand-mark"><Workflow size={20} strokeWidth={2.5} /></div>

          <span>devmesh<span className="brand-period">.</span></span>

          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={18}/></button>

        </div>



        <button className="workspace-switcher">

          <div className="workspace-avatar">A</div>

          <div className="workspace-copy"><strong>Acme Workspace</strong><span>Free workspace</span></div>

          <ChevronDown size={15} className="muted-icon"/>

        </button>



        <div className="sidebar-nav">

          {navGroups.map(group => (

            <div className="nav-group" key={group.label}>

              <div className="nav-label">{group.label}</div>

              {group.items.map(item => {

                const Icon = item.icon

                return <button key={item.name} className={`nav-item ${activeNav === item.name ? 'active' : ''}`} onClick={() => { setActiveNav(item.name); setSidebarOpen(false) }}>

                  <Icon size={17} strokeWidth={1.8}/><span>{item.name}</span>

                  {'count' in item && <span className="nav-count">{item.count}</span>}

                </button>

              })}

            </div>

          ))}

        </div>



        <div className="sidebar-bottom">

          <div className="usage-card">
            <div className="usage-heading"><span>Monthly usage</span><span className="usage-percent">—</span></div>
            <div className="usage-track"><div className="usage-fill" style={{ width: '0%' }}/></div>
            <p>Usage metrics not yet available</p>

            <button onClick={() => notify('Usage plans will be configured in a later milestone')}>View usage <ArrowUpRight size={13}/></button>

          </div>

          <button className="nav-item" onClick={() => notify('Settings will be added in a later milestone')}><Settings2 size={17}/><span>Settings</span></button>

          <button className="nav-item" onClick={() => notify('Help documentation will be added soon')}><CircleHelp size={17}/><span>Help & documentation</span></button>

          <div className="profile-row">

            <div className="profile-avatar">{(authUser.displayName || authUser.email).slice(0, 2).toUpperCase()}</div>

            <div className="profile-copy"><strong>{authUser.displayName}</strong><span>{authUser.email}</span></div>

            <Ellipsis size={19} className="muted-icon"/>

          </div>

        </div>

      </aside>



      {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu"/>}



      <main className="main-area">

        <header className="topbar">

          <div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20}/></button><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{activeNav}</strong></div>

          <div className="topbar-actions">

            <div className="environment-pill"><span className="env-dot"/> Development</div>

            <button className="icon-button command-button" onClick={() => document.getElementById('job-search')?.focus()} aria-label="Search"><Search size={17}/><kbd><Command size={11}/> K</kbd></button>

            <button className="icon-button notification-button" onClick={() => notify('You are all caught up')} aria-label="Notifications"><Bell size={17}/><i/></button>

            <div className="top-avatar">{(authUser.displayName || authUser.email).slice(0, 2).toUpperCase()}</div>
            <button className="icon-button" onClick={signOut} title="Sign out" aria-label="Sign out"><X size={16}/></button>

          </div>

        </header>



        <div className="page-content">

          <section className="welcome-row">

            <div>

              <div className="eyebrow"><Sparkles size={13}/> DEVMESH CONTROL PLANE</div>

              <h1>{activeNav === 'Overview' ? 'Good afternoon, Deepanshu' : activeNav}</h1>

              <p className="page-subtitle">{activeNav === 'Overview' ? 'Here’s what’s happening across your job infrastructure.' : `Monitor and manage your ${activeNav.toLowerCase()} across the workspace.`}</p>

            </div>

            <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17}/> Create job</button>

          </section>



          <section className="system-banner">

            <div className="banner-icon"><Activity size={19}/></div>

            <div className="banner-copy">
              <strong>{health === true ? 'System operational' : health === false ? 'Service unavailable' : 'Checking system health'}</strong>
              <span>{health === true ? 'API, PostgreSQL, and Redis health checks passed.' : health === false ? `${healthError || 'Unable to reach the health endpoint.'} API: ${API_BASE_URL}` : `Checking API, database, and Redis at ${API_BASE_URL}.`}</span>
            </div>

            <div className="banner-right">
              <span className="live-dot"/>
              {health === true ? 'SYSTEM HEALTHY' : health === false ? 'SYSTEM DEGRADED' : 'CHECKING'}
              {health !== true && <button className="health-retry" onClick={() => setHealthCheckVersion(version => version + 1)} disabled={health === null}>Retry</button>}
            </div>

          </section>



          <section className="metrics-grid">

            <MetricCard title="Total jobs" value={(metrics?.totalJobs ?? jobs.length).toLocaleString('en-US')} change="" trend="neutral" icon={<Boxes size={17}/>} footer="All persisted jobs" />

            <MetricCard title="Success rate" value={metrics?.successRate24h == null ? '—' : `${metrics.successRate24h}%`} change="" trend="neutral" icon={<ShieldCheck size={17}/>} footer={metrics ? `${metrics.completedLast24h} completed in the last 24 hours` : 'Loading metrics…'} />

            <MetricCard title="Avg. execution" value={metrics?.averageDurationMs == null ? '—' : `${(metrics.averageDurationMs / 1000).toFixed(2)}s`} change="" trend="neutral" icon={<Gauge size={17}/>} footer="Average recorded attempt duration" />

            <MetricCard title="Active workers" value={metrics?.workers.active == null ? '—' : String(metrics.workers.active)} change="" trend="neutral" icon={<Cpu size={17}/>} footer={metrics ? `${metrics.workers.processing} jobs processing now` : 'Loading worker status…'} />

          </section>



          {['Overview', 'Workers', 'Monitoring'].includes(activeNav) && (
          <section className="middle-grid">

            <div className="panel throughput-panel">

              <div className="panel-heading">

                <div><h2>Job activity</h2><p>Current status of jobs loaded from the API</p></div>

                <button className="select-button" onClick={() => notify('Time range selection will be connected to real metrics later')}>Last 24 hours <ChevronDown size={14}/></button>

              </div>

              <div className="chart-summary"><strong>{jobs.filter(job => ['Completed', 'Failed'].includes(job.status)).length}</strong><span className="chart-summary-caption">finished jobs currently loaded</span></div>

              <div className="chart">

                <div className="chart-y-labels"><span>1.5k</span><span>1.0k</span><span>500</span><span>0</span></div>

                <div className="chart-canvas">

                  <div className="chart-gridlines"><i/><i/><i/><i/></div>

                  <div className="chart-placeholder">
  Historical throughput time-series are not stored yet. Live queue and worker metrics are available in Monitoring.
</div>

                  <div className="chart-x-labels"><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>Now</span></div>

                </div>

              </div>

            </div>



            <div className="panel workers-panel">

              <div className="panel-heading"><div><h2>Worker health</h2><p>Current worker pool status</p></div><button className="icon-button subtle-button" onClick={() => setActiveNav('Workers')} aria-label="View workers"><ArrowUpRight size={17}/></button></div>

              <div className="worker-total"><div className="worker-total-number">{metrics?.workers.active ?? '—'} <span>workers online</span></div><span className="healthy-pill">{metrics ? 'Live status' : 'Connecting…'}</span></div>

              {metrics?.workers.instances?.length ? (
                <div className="worker-bars">
                  {metrics.workers.instances.map(worker => (
                    <div className="worker-bar-row" key={worker.id}>
                      <div className="worker-bar-label">
                        <span>{worker.id}</span>
                        <strong>{worker.activeJobs} active</strong>
                      </div>
                      <div className="worker-track">
                        <div style={{ width: worker.activeJobs > 0 ? '100%' : '8%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="chart-placeholder">
                  {metrics ? 'No live workers detected. Start the worker process to see its heartbeat here.' : 'Waiting for worker health data…'}
                </div>
              )}

              <div className="worker-footer">
                {metrics ? `Queue: ${metrics.queue.waiting ?? 0} waiting · ${metrics.queue.active ?? 0} active · ${metrics.queue.failed ?? 0} failed` : 'Worker and queue metrics are loading.'}
              </div>

            </div>

          </section>
          )}

          {['Overview', 'Jobs'].includes(activeNav) && (
          <section className="panel jobs-panel">

            <div className="panel-heading jobs-heading">

              <div><h2>Recent jobs</h2><p>Track execution status and inspect recent activity</p></div>

              <button className="secondary-button" onClick={() => setActiveNav('Jobs')}>View all jobs <ArrowUpRight size={14}/></button>

            </div>

            <div className="table-toolbar">

              <div className="search-field"><Search size={15}/><input id="job-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs, IDs, or types..." /></div>

              <label className="filter-select">
  <Filter size={14} />
  <select
    value={statusFilter}
    onChange={e => setStatusFilter(e.target.value)}
    aria-label="Filter by status"
  >
    <option>All statuses</option>
    <option>Running</option>
    <option>Queued</option>
    <option>Retrying</option>
    <option>Completed</option>
    <option>Failed</option>
    <option>Cancelled</option>
  </select>
  <ChevronDown size={13} />
</label>

              <button className="icon-button table-filter-button" onClick={() => { setSearch(''); setStatusFilter('All statuses') }} aria-label="Clear filters"><ListFilter size={16}/></button>

            </div>

            <div className="table-wrap">

              <table>

                <thead><tr><th>JOB</th><th>STATUS</th><th>PRIORITY</th><th>DURATION</th><th>SUBMITTED</th><th><span className="sr-only">Actions</span></th></tr></thead>

                <tbody>

                  {filteredJobs.map(job => <tr key={job.id}>

                    <td><div className="job-cell"><div className="job-type-icon"><TerminalSquare size={16}/></div><div className="job-info"><strong>{job.name}</strong><span>{job.id} <span className="job-type-sep">·</span> {job.type}</span></div></div></td>

                    <td><span className={`status-pill ${statusClass[job.status]}`}><i/>{job.status}</span></td>

                    <td><span className={`priority ${job.priority.toLowerCase()}`}><i/>{job.priority}</span></td>

                    <td className="duration-cell">{job.duration}</td><td className="submitted-cell">{job.submitted}</td>

                    <td>
<button
  className="row-more"
  aria-label={`View details for ${job.name}`}
  onClick={() => {
    setSelectedJob(job)
    setJobDetails(null)
    setLoadingJobDetails(true)
  }}
>
  <Ellipsis size={18} />
</button>
</td>

                  </tr>)}

                  {filteredJobs.length === 0 && <tr><td colSpan={6} className="empty-state">No jobs match your search.</td></tr>}

                </tbody>

              </table>

            </div>

            <div className="table-footer"><span>Showing <strong>{filteredJobs.length}</strong> of <strong>{jobs.length}</strong> jobs</span><button onClick={() => { setSearch(''); setStatusFilter('All statuses') }}>Clear filters <X size={13}/></button></div>

          </section>
          )}

          {activeNav === 'Execution logs' && (
            <section className="panel jobs-panel">
              <div className="panel-heading jobs-heading">
                <div>
                  <h2>Execution logs</h2>
                  <p>Most recent job state changes, refreshed every five seconds</p>
                </div>
                <span className="healthy-pill">{executionEvents.length} events</span>
              </div>
              {loadingEvents && executionEvents.length === 0 ? (
                <div className="chart-placeholder">Loading execution events…</div>
              ) : executionEvents.length ? (
                <div className="job-event-timeline">
                  {executionEvents.map((event, index) => (
                    <div className="job-event-item" key={event.id}>
                      <div className={`job-event-marker ${event.eventType.toLowerCase()}`} />
                      <div className="job-event-body">
                        <div className="job-event-heading">
                          <strong>{event.eventType.replaceAll('_', ' ')}</strong>
                          <span>{index + 1}</span>
                        </div>
                        <p>{event.message}</p>
                        <p className="payload-help">
                          {event.job?.name ?? 'Unknown job'} · {event.job?.type ?? 'unknown type'} · {event.job?.id ?? event.jobId}
                        </p>
                        <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="chart-placeholder">No execution events have been recorded yet.</div>
              )}
            </section>
          )}

          {activeNav === 'Monitoring' && (
            <section className="panel jobs-panel">
              <div className="panel-heading jobs-heading">
                <div>
                  <h2>Job status distribution</h2>
                  <p>Live counts from persisted job records</p>
                </div>
              </div>
              {Object.entries(metrics?.statusCounts ?? {}).length ? (
                <div className="worker-bars">
                  {Object.entries(metrics.statusCounts).map(([status, count]) => {
                    const total = Math.max(metrics.totalJobs, 1)
                    const percent = Math.round((count / total) * 100)
                    return (
                      <div className="worker-bar-row" key={status}>
                        <div className="worker-bar-label">
                          <span>{status.replaceAll('_', ' ')}</span>
                          <strong>{count} · {percent}%</strong>
                        </div>
                        <div className="worker-track">
                          <div style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="chart-placeholder">Job status metrics will appear after the API responds.</div>
              )}
            </section>
          )}

          {activeNav === 'Workflows' && (
            <section className="panel jobs-panel">
              <div className="panel-heading jobs-heading">
                <div>
                  <h2>Workflow templates</h2>
                  <p>Save a reusable sequence of jobs and run it with dependency-aware scheduling.</p>
                </div>
                <button className="primary-button" onClick={() => setShowCreateWorkflow(true)} disabled={!projectId}>
                  <Plus size={15} /> New workflow
                </button>
              </div>
              {loadingWorkflows ? (
                <div className="chart-placeholder">Loading workflow templates…</div>
              ) : workflows.length ? (
                <div className="worker-bars">
                  {workflows.map(workflow => (
                    <div className="job-details-record" key={workflow.id}>
                      <strong>{workflow.name}</strong>
                      <p>{workflow.description || 'No description provided.'}</p>
                      <p>{Array.isArray(workflow.steps) ? workflow.steps.length : 0} sequential steps</p>
                      <button className="secondary-button" onClick={() => runWorkflow(workflow.id)}>
                        <Zap size={14} /> Run workflow
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="chart-placeholder">
                  {projectId ? 'No workflow templates yet. Create one to run a multi-step job chain.' : 'No project is available. Run npm run db:seed, then restart the API.'}
                </div>
              )}
            </section>
          )}

{selectedJob && (
  <div className="job-details-overlay">
    <section
      className="job-details-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-details-title"
    >
      <div className="panel-heading">
        <div>
          <h2 id="job-details-title">Job Details</h2>
          <p>{selectedJob.name}</p>
        </div>

        <button
          className="icon-button"
          onClick={() => {
            setSelectedJob(null)
            setJobDetails(null)
          }}
          aria-label="Close job details"
        >
          <X size={18} />
        </button>
      </div>

      {loadingJobDetails && !jobDetails ? (
        <p>Loading job details...</p>
      ) : jobDetails ? (
        <div className="job-details-content">
          <div>
            <strong>Status</strong>
            <p>{jobDetails.status}</p>
          </div>


<div>
  <strong>Job ID</strong>
  <div className="job-id-copy-row">
    <p className="job-details-id">{jobDetails.id}</p>
    <button
      type="button"
      className="job-copy-button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(jobDetails.id)
          notify('Job ID copied to clipboard')
        } catch (error) {
          console.error('Failed to copy job ID:', error)
          notify('Could not copy job ID')
        }
      }}
      aria-label="Copy job ID"
      title="Copy job ID"
    >
      <Copy size={14} />
    </button>
  </div>
</div>


          <div>
            <strong>Type</strong>
            <p>{jobDetails.type}</p>
          </div>

          <div>
            <strong>Priority</strong>
            <p>{jobDetails.priority}</p>
          </div>

          {jobDetails.dependencies?.length > 0 && (
            <div>
              <strong>Depends on</strong>
              {jobDetails.dependencies.map(dependency => (
                <p key={dependency.id}>{dependency.dependencyJob.name} — {dependency.dependencyJob.status}</p>
              ))}
            </div>
          )}

          {jobDetails.dependents?.length > 0 && (
            <div>
              <strong>Dependent jobs</strong>
              {jobDetails.dependents.map(dependency => (
                <p key={dependency.id}>{dependency.dependentJob.name} — {dependency.dependentJob.status}</p>
              ))}
            </div>
          )}


<div>
  <strong>Total Attempts</strong>
  <p>{jobDetails.attempts?.length ?? jobDetails.attemptCount}</p>
  <small>Includes previous failures and manual retries.</small>
</div>

<div>
  <strong>Retry Limit</strong>
  <p>{jobDetails.maxAttempts} per queue execution</p>
</div>


          <div>
            <strong>Created</strong>
            <p>{new Date(jobDetails.createdAt).toLocaleString()}</p>
          </div>


{jobDetails.errorMessage && (
  <div className="job-details-error">
    <strong>Error</strong>
    <p>{jobDetails.errorMessage}</p>
  </div>
)}


{['QUEUED', 'RETRYING'].includes(jobDetails.status) && (
  <div className="job-details-section">
    <h3>Cancel Job</h3>
    <p>This job has not started execution yet. Cancelling prevents it from being claimed by a worker.</p>
    <button
      type="button"
      className="secondary-button"
      onClick={async () => {
        try {
          const response = await apiFetch(
            `${API_BASE_URL}/api/v1/jobs/${jobDetails.id}/cancel`,
            { method: 'POST' },
          )
          const result = await response.json()
          if (!response.ok) {
            throw new Error(result.error?.message || 'Unable to cancel job')
          }
          setJobDetails(current => ({ ...current, ...result.data }))
          notify('Job cancelled')
        } catch (error) {
          console.error('Failed to cancel job:', error)
          notify(error.message || 'Unable to cancel job')
        }
      }}
    >
      <X size={14} /> Cancel Job
    </button>
  </div>
)}

{jobDetails.status === 'FAILED' && (
  <div className="job-details-section">
    <h3>Retry Job</h3>
    <p>
      This job failed. You can queue it for another execution.
      Previous execution attempts will remain in the history.
    </p>

    <button
      type="button"
      className="secondary-button"
      onClick={async () => {
        try {
          const response = await apiFetch(
            `${API_BASE_URL}/api/v1/jobs/${jobDetails.id}/retry`,
            { method: 'POST' },
          )

          const result = await response.json()

          if (!response.ok) {
            throw new Error(
              result.error?.message || 'Unable to retry job',
            )
          }

          notify('Job queued for retry')
        } catch (error) {
          console.error('Failed to retry job:', error)
          notify(error.message || 'Unable to retry job')
        }
      }}
    >
      <Zap size={14} />
      Retry Job
    </button>
  </div>
)}




<div className="job-details-section">
  <h3>Input</h3>

  <textarea
    value={editedJobPayload}
    onChange={event => setEditedJobPayload(event.target.value)}
    placeholder="Edit the full job payload as JSON..."
    rows={8}
    spellCheck={false}
    readOnly={jobDetails.status !== 'FAILED'}
    aria-label="Job input payload as JSON"
  />

  <button
    type="button"
    className="secondary-button"
    disabled={savingJobInput || jobDetails.status !== 'FAILED' || !editedJobPayload.trim()}
    onClick={async () => {
      let parsedPayload
      try {
        parsedPayload = JSON.parse(editedJobPayload)
      } catch {
        notify('Input must be valid JSON')
        return
      }

      if (
        parsedPayload === null ||
        typeof parsedPayload !== 'object' ||
        Array.isArray(parsedPayload)
      ) {
        notify('Input JSON must be an object')
        return
      }

      setSavingJobInput(true)

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/v1/jobs/${jobDetails.id}/input`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ payload: parsedPayload }),
          },
        )

        const result = await response.json()

        if (!response.ok) {
          throw new Error(
            result.error?.message || 'Unable to save job input',
          )
        }

        setJobDetails(current => ({
          ...current,
          ...result.data,
        }))

        notify('Job input saved successfully')
      } catch (error) {
        console.error('Failed to save job input:', error)
        notify(error.message || 'Unable to save job input')
      } finally {
        setSavingJobInput(false)
      }
    }}
  >
    {savingJobInput ? 'Saving...' : 'Save Input'}
  </button>

</div>


          <div className="job-details-section">
            <h3>Result</h3>
            <pre>
              {jobDetails.result
                ? JSON.stringify(jobDetails.result, null, 2)
                : 'No result available yet.'}
            </pre>
          </div>

          <div className="job-details-section">
            <h3>Execution Attempts</h3>

            {jobDetails.attempts?.length ? (
              jobDetails.attempts.map(attempt => (
                <div className="job-details-record" key={attempt.id}>
                  <strong>Attempt {attempt.attempt}</strong>
                  <p>Status: {attempt.status}</p>
                  <p>Worker: {attempt.workerId || 'Not assigned'}</p>
                  <p>
                    Duration:{' '}
                    {attempt.durationMs != null
                      ? `${attempt.durationMs} ms`
                      : 'In progress'}
                  </p>
                  {attempt.errorMessage && (
                    <p className="job-details-error">
                      {attempt.errorMessage}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p>No execution attempts recorded yet.</p>
            )}
          </div>


<div className="job-details-section">
  <h3>Event Timeline</h3>

  {jobDetails.events?.length ? (
    <div className="job-event-timeline">
      {jobDetails.events.map((event, index) => (
        <div className="job-event-item" key={event.id}>
          <div
            className={`job-event-marker ${event.eventType.toLowerCase()}`}
          />

          <div className="job-event-body">
            <div className="job-event-heading">
              <strong>{event.eventType.replaceAll('_', ' ')}</strong>
              <span>{index + 1}</span>
            </div>

            <p>{event.message}</p>

            <time dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleString()}
            </time>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p>No events recorded yet.</p>
  )}
</div>

        </div>
      ) : (
        <p>Unable to load job details. Check the browser console and try again.</p>
      )}
    </section>
  </div>
)}



          <footer className="page-footer"><span>© 2026 DevMesh. Built for reliable background execution.</span><span><i className="footer-status"/> All systems normal <span className="footer-sep">·</span> <button onClick={() => notify('Documentation will be available as the API is implemented')}>Documentation <ArrowUpRight size={12}/></button></span></footer>

        </div>

      </main>



      {showCreate && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>

        <form className="create-modal" onSubmit={createJob}>

          <div className="modal-header"><div><div className="modal-icon"><Plus size={19}/></div><h2>Create a job</h2><p>Submit a task to the DevMesh queue.</p></div><button type="button" className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close dialog"><X size={18}/></button></div>

          <label className="form-label">Job name<input autoFocus value={jobName} onChange={e => setJobName(e.target.value)} placeholder="e.g. Process monthly report" required maxLength={100}/></label>

          <label className="form-label">Job type<select value={jobType} onChange={e => { const type = e.target.value; setJobType(type); setJobPayload(type === 'report.generate' ? '{\n  "records": [\n    { "name": "Ada", "score": 95 },\n    { "name": "Lin", "score": 88 },\n    { "name": "Grace", "score": 92 }\n  ]\n}' : type === 'catalog.sync' ? '{\n  "products": [\n    { "sku": "SKU-001", "name": "Keyboard", "price": 49.99 },\n    { "sku": "SKU-002", "name": "Mouse", "price": 19.99 }\n  ]\n}' : type === 'notification.send' ? '{\n  "to": "demo@example.com",\n  "message": "Your DevMesh job has completed"\n}' : '{\n  "text": "Hello from DevMesh"\n}') }}><option value="file.process">File processing</option><option value="report.generate">Report generation</option><option value="notification.send">Send notifications (simulated)</option><option value="catalog.sync">Catalog synchronization</option></select></label>

          <label className="form-label">Job input (JSON)<textarea className="payload-editor" value={jobPayload} onChange={e => setJobPayload(e.target.value)} rows={8} spellCheck={false} required aria-describedby="job-payload-help" /></label>
          <p id="job-payload-help" className="payload-help">Enter a JSON object for this job type. Report generation expects a records array; catalog sync expects a products array.</p>

          <label className="form-label">Depends on job IDs (optional)<input value={jobDependencies} onChange={e => setJobDependencies(e.target.value)} placeholder="Paste job IDs separated by commas" /></label>
          <p className="payload-help">This job waits until every listed job completes successfully. Failed prerequisites cancel downstream jobs.</p>

          <div className="demo-notice"><Zap size={15}/><span>Jobs are submitted to the DevMesh queue for processing.</span></div>

          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="primary-button"><Plus size={15}/> Create job</button></div>

        </form>

      </div>}



      {showCreateWorkflow && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreateWorkflow(false) }}>
        <form className="create-modal" onSubmit={createWorkflow}>
          <div className="modal-header">
            <div>
              <div className="modal-icon"><Workflow size={19}/></div>
              <h2>Create workflow template</h2>
              <p>Each step starts after the previous step completes successfully.</p>
            </div>
            <button type="button" className="icon-button" onClick={() => setShowCreateWorkflow(false)} aria-label="Close dialog"><X size={18}/></button>
          </div>

          <label className="form-label">Workflow name<input autoFocus value={workflowName} onChange={e => setWorkflowName(e.target.value)} placeholder="e.g. Process and report" required maxLength={100}/></label>
          <label className="form-label">Description (optional)<input value={workflowDescription} onChange={e => setWorkflowDescription(e.target.value)} placeholder="What this workflow does" maxLength={500}/></label>
          <label className="form-label">Steps (JSON array)<textarea className="payload-editor" value={workflowSteps} onChange={e => setWorkflowSteps(e.target.value)} rows={12} spellCheck={false} required /></label>
          <p className="payload-help">Use 1–20 steps. Each step needs a name and supported type; payload examples are included above.</p>
          <div className="demo-notice"><Workflow size={15}/><span>Workflow steps run in order. A failed step cancels downstream steps.</span></div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setShowCreateWorkflow(false)}>Cancel</button>
            <button type="submit" className="primary-button"><Plus size={15}/> Save template</button>
          </div>
        </form>
      </div>}

      {toast && <div className="toast"><Check size={16}/>{toast}</div>}

    </div>

  )

}



function MetricCard({ title, value, change, trend, icon, footer }) {

  return <div className="metric-card"><div className="metric-top"><span>{title}</span><span className="metric-icon">{icon}</span></div><div className="metric-value-row"><strong>{value}</strong><span className={`metric-change ${trend}`}>{trend === 'up' && <ArrowUpRight size={13}/>} {change}</span></div><div className="metric-footer">{footer}</div></div>

}



function WorkerBar({ label, count, width }) {

  return <div className="worker-bar-row"><div className="worker-bar-label"><span>{label}</span><strong>{count}</strong></div><div className="worker-track"><div style={{ width }}/></div></div>

}



export default App
