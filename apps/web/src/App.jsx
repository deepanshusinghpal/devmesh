import { useEffect, useMemo, useState } from 'react'

import {

  Activity, ArrowDownRight, ArrowUpRight, Bell, Boxes, Check, ChevronDown,

  CircleHelp, Clock3, Command, Cpu, Download, Ellipsis, Filter, Gauge,

  GitBranch, LayoutDashboard, ListFilter, Menu, Plus, Search, Settings2,

  ShieldCheck, Sparkles, TerminalSquare, Workflow, X, Zap,

} from 'lucide-react'



// const initialJobs = [

//   { id: 'job_8f31a2', name: 'Process customer exports', type: 'file.process', status: 'Running', duration: '00:12', submitted: '2 min ago', priority: 'High' },

//   { id: 'job_7c90bd', name: 'Generate weekly report', type: 'report.generate', status: 'Queued', duration: '—', submitted: '4 min ago', priority: 'Normal' },

//   { id: 'job_61ab42', name: 'Sync product catalog', type: 'catalog.sync', status: 'Completed', duration: '00:08', submitted: '8 min ago', priority: 'Normal' },

//   { id: 'job_4de109', name: 'Send notification batch', type: 'notification.send', status: 'Failed', duration: '00:03', submitted: '12 min ago', priority: 'Low' },

//   { id: 'job_3ab7f0', name: 'Rebuild search index', type: 'search.reindex', status: 'Completed', duration: '00:42', submitted: '19 min ago', priority: 'High' },

// ]
const initialJobs = []



const statusClass = {

  Running: 'running', Queued: 'queued', Completed: 'completed', Failed: 'failed',

}



function App() {

  const [jobs, setJobs] = useState(initialJobs)
  const [loadingJobs, setLoadingJobs] = useState(true)

useEffect(() => {
  let cancelled = false

  async function loadJobs() {
    try {
      const response = await fetch('http://localhost:4000/api/v1/jobs')
      if (!response.ok) throw new Error('Could not load jobs')

      const result = await response.json()

      const formattedJobs = result.data.map(job => ({
        id: job.id,
        name: job.name,
        type: job.type,
        status: job.status.charAt(0) + job.status.slice(1).toLowerCase(),
        duration: '—',
        submitted: new Date(job.createdAt).toLocaleString(),
        priority:
          job.priority.charAt(0) + job.priority.slice(1).toLowerCase(),
      }))

      if (!cancelled) setJobs(formattedJobs)
    } catch (error) {
      console.error('Failed to load jobs:', error)
      if (!cancelled) notify('Could not load jobs from the API')
    } finally {
      if (!cancelled) setLoadingJobs(false)
    }
  }

  loadJobs()

  return () => {
    cancelled = true
  }
}, [])

  const [activeNav, setActiveNav] = useState('Overview')

  const [search, setSearch] = useState('')

  const [statusFilter, setStatusFilter] = useState('All statuses')

  const [showCreate, setShowCreate] = useState(false)

  const [jobName, setJobName] = useState('')

  const [jobType, setJobType] = useState('file.process')

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

  try {
    const response = await fetch('http://localhost:4000/api/v1/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: jobName.trim(),
        type: jobType,
        projectId: 'cmv3z5o7v0002qyxwrhjwvwtt',
        payload: {},
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
    setShowCreate(false)
    setActiveNav('Jobs')
    notify('Job saved successfully')
  } catch (error) {
    console.error('Create job failed:', error)
    notify(error.message || 'Could not create job')
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

            <div className="profile-avatar">DP</div>

            <div className="profile-copy"><strong>Deepanshu</strong><span>Project owner</span></div>

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

            <div className="top-avatar">DP</div>

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

            <div className="banner-copy"><strong>System operational</strong><span>DevMesh API, database, and queue integration are available for local development.</span></div>

            <div className="banner-right"><span className="live-dot"/> LOCAL DEVELOPMENT</div>

          </section>



          <section className="metrics-grid">

            <MetricCard title="Total jobs" value={jobs.length.toLocaleString('en-US')} change="+12.8%" trend="up" icon={<Boxes size={17}/>} footer="vs. previous 24 hours" />

            <MetricCard title="Success rate" value="—" change="" trend="neutral" icon={<ShieldCheck size={17}/>} footer="Metrics not yet implemented" />

            <MetricCard title="Avg. execution" value="—" change="" trend="neutral" icon={<Gauge size={17}/>} footer="Metrics not yet implemented" />

            <MetricCard title="Active workers" value="—" change="" trend="neutral" icon={<Cpu size={17}/>} footer="Worker metrics not yet implemented" />

          </section>



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
  Historical job throughput will be available when metrics are implemented.
</div>

                  <div className="chart-x-labels"><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>Now</span></div>

                </div>

              </div>

            </div>



            <div className="panel workers-panel">

              <div className="panel-heading"><div><h2>Worker health</h2><p>Current worker pool status</p></div><button className="icon-button subtle-button" onClick={() => setActiveNav('Workers')} aria-label="View workers"><ArrowUpRight size={17}/></button></div>

              <div className="worker-total"><div className="worker-total-number">— <span>workers</span></div><span className="healthy-pill">Worker metrics unavailable</span></div>

              <div className="chart-placeholder">
  Worker pool metrics are not yet connected to the API.
</div>

              <div className="worker-footer">Worker health data is not yet available.</div>

            </div>

          </section>



          <section className="panel jobs-panel">

            <div className="panel-heading jobs-heading">

              <div><h2>Recent jobs</h2><p>Track execution status and inspect recent activity</p></div>

              <button className="secondary-button" onClick={() => setActiveNav('Jobs')}>View all jobs <ArrowUpRight size={14}/></button>

            </div>

            <div className="table-toolbar">

              <div className="search-field"><Search size={15}/><input id="job-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs, IDs, or types..." /></div>

              <label className="filter-select"><Filter size={14}/><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status"><option>All statuses</option><option>Running</option><option>Queued</option><option>Completed</option><option>Failed</option></select><ChevronDown size={13}/></label>

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

                    <td><button className="row-more" aria-label={`More actions for ${job.name}`} onClick={() => notify(`${job.name}: demo record — API integration comes next`)}><Ellipsis size={18}/></button></td>

                  </tr>)}

                  {filteredJobs.length === 0 && <tr><td colSpan={6} className="empty-state">No jobs match your search.</td></tr>}

                </tbody>

              </table>

            </div>

            <div className="table-footer"><span>Showing <strong>{filteredJobs.length}</strong> of <strong>{jobs.length}</strong> jobs</span><button onClick={() => { setSearch(''); setStatusFilter('All statuses') }}>Clear filters <X size={13}/></button></div>

          </section>



          <footer className="page-footer"><span>© 2026 DevMesh. Built for reliable background execution.</span><span><i className="footer-status"/> All systems normal <span className="footer-sep">·</span> <button onClick={() => notify('Documentation will be available as the API is implemented')}>Documentation <ArrowUpRight size={12}/></button></span></footer>

        </div>

      </main>



      {showCreate && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>

        <form className="create-modal" onSubmit={createJob}>

          <div className="modal-header"><div><div className="modal-icon"><Plus size={19}/></div><h2>Create a job</h2><p>Submit a task to the DevMesh queue.</p></div><button type="button" className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close dialog"><X size={18}/></button></div>

          <label className="form-label">Job name<input autoFocus value={jobName} onChange={e => setJobName(e.target.value)} placeholder="e.g. Process monthly report" required maxLength={100}/></label>

          <label className="form-label">Job type<select value={jobType} onChange={e => setJobType(e.target.value)}><option value="file.process">File processing</option><option value="report.generate">Report generation</option><option value="notification.send">Send notifications</option><option value="catalog.sync">Catalog synchronization</option></select></label>

          <div className="demo-notice"><Zap size={15}/><span>Jobs are submitted to the DevMesh queue for processing.</span></div>

          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="primary-button"><Plus size={15}/> Create job</button></div>

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
