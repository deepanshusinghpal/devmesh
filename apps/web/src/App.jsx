import { useMemo, useState } from 'react'

import {

  Activity, ArrowDownRight, ArrowUpRight, Bell, Boxes, Check, ChevronDown,

  CircleHelp, Clock3, Command, Cpu, Download, Ellipsis, Filter, Gauge,

  GitBranch, LayoutDashboard, ListFilter, Menu, Plus, Search, Settings2,

  ShieldCheck, Sparkles, TerminalSquare, Workflow, X, Zap,

} from 'lucide-react'



const initialJobs = [

  { id: 'job_8f31a2', name: 'Process customer exports', type: 'file.process', status: 'Running', duration: '00:12', submitted: '2 min ago', priority: 'High' },

  { id: 'job_7c90bd', name: 'Generate weekly report', type: 'report.generate', status: 'Queued', duration: '—', submitted: '4 min ago', priority: 'Normal' },

  { id: 'job_61ab42', name: 'Sync product catalog', type: 'catalog.sync', status: 'Completed', duration: '00:08', submitted: '8 min ago', priority: 'Normal' },

  { id: 'job_4de109', name: 'Send notification batch', type: 'notification.send', status: 'Failed', duration: '00:03', submitted: '12 min ago', priority: 'Low' },

  { id: 'job_3ab7f0', name: 'Rebuild search index', type: 'search.reindex', status: 'Completed', duration: '00:42', submitted: '19 min ago', priority: 'High' },

]



const statusClass = {

  Running: 'running', Queued: 'queued', Completed: 'completed', Failed: 'failed',

}



function App() {

  const [jobs, setJobs] = useState(initialJobs)

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



  function createJob(event) {

    event.preventDefault()

    if (!jobName.trim()) return

    const job = {

      id: `job_${Math.random().toString(16).slice(2, 8)}`,

      name: jobName.trim(), type: jobType, status: 'Queued', duration: '—', submitted: 'Just now', priority: 'Normal',

    }

    setJobs(current => [job, ...current])

    setJobName('')

    setShowCreate(false)

    setActiveNav('Jobs')

    notify('Demo job added to the local dashboard')

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

            <div className="usage-heading"><span>Monthly usage</span><span className="usage-percent">68%</span></div>

            <div className="usage-track"><div className="usage-fill"/></div>

            <p>68,420 <span>/ 100,000 jobs</span></p>

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

            <div className="banner-copy"><strong>System operational</strong><span>All demo services are reporting normally. Live infrastructure connection is coming in the next milestone.</span></div>

            <div className="banner-right"><span className="live-dot"/> DEMO MODE</div>

          </section>



          <section className="metrics-grid">

            <MetricCard title="Total jobs" value={jobs.length.toLocaleString('en-US')} change="+12.8%" trend="up" icon={<Boxes size={17}/>} footer="vs. previous 24 hours" />

            <MetricCard title="Success rate" value="98.24%" change="+2.4%" trend="up" icon={<ShieldCheck size={17}/>} footer="vs. previous 24 hours" />

            <MetricCard title="Avg. execution" value="1.42s" change="-8.2%" trend="up" icon={<Gauge size={17}/>} footer="vs. previous 24 hours" />

            <MetricCard title="Active workers" value="08" change="2 idle" trend="neutral" icon={<Cpu size={17}/>} footer="across 3 worker pools" />

          </section>



          <section className="middle-grid">

            <div className="panel throughput-panel">

              <div className="panel-heading">

                <div><h2>Job throughput</h2><p>Processed jobs over the last 24 hours</p></div>

                <button className="select-button" onClick={() => notify('Time range selection will be connected to real metrics later')}>Last 24 hours <ChevronDown size={14}/></button>

              </div>

              <div className="chart-summary"><strong>24,891</strong><span className="positive"><ArrowUpRight size={14}/> 14.6%</span><span className="chart-summary-caption">jobs processed</span></div>

              <div className="chart">

                <div className="chart-y-labels"><span>1.5k</span><span>1.0k</span><span>500</span><span>0</span></div>

                <div className="chart-canvas">

                  <div className="chart-gridlines"><i/><i/><i/><i/></div>

                  <svg viewBox="0 0 680 180" preserveAspectRatio="none" role="img" aria-label="Illustrative job throughput chart">

                    <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7c6cf2" stopOpacity=".26"/><stop offset="100%" stopColor="#7c6cf2" stopOpacity="0"/></linearGradient></defs>

                    <path d="M0 142 C28 137 30 122 58 128 S95 115 118 126 S154 96 180 111 S210 100 238 107 S265 78 294 91 S326 82 352 94 S385 57 410 72 S444 67 468 76 S495 43 526 60 S555 46 582 54 S620 29 646 42 S665 25 680 30 L680 180 L0 180 Z" fill="url(#chartFill)"/>

                    <path d="M0 142 C28 137 30 122 58 128 S95 115 118 126 S154 96 180 111 S210 100 238 107 S265 78 294 91 S326 82 352 94 S385 57 410 72 S444 67 468 76 S495 43 526 60 S555 46 582 54 S620 29 646 42 S665 25 680 30" fill="none" stroke="#8c7cf6" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>

                  </svg>

                  <div className="chart-x-labels"><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>Now</span></div>

                </div>

              </div>

            </div>



            <div className="panel workers-panel">

              <div className="panel-heading"><div><h2>Worker health</h2><p>Current worker pool status</p></div><button className="icon-button subtle-button" onClick={() => setActiveNav('Workers')} aria-label="View workers"><ArrowUpRight size={17}/></button></div>

              <div className="worker-total"><div className="worker-total-number">08 <span>workers</span></div><span className="healthy-pill"><Check size={12}/> All healthy</span></div>

              <div className="worker-bars">

                <WorkerBar label="General purpose" count="04 / 04" width="100%" />

                <WorkerBar label="High priority" count="02 / 02" width="100%" />

                <WorkerBar label="Scheduled jobs" count="02 / 02" width="100%" />

              </div>

              <div className="worker-footer"><span><i className="legend-dot green"/> Healthy 8</span><span><i className="legend-dot gray"/> Offline 0</span></div>

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

            <div className="table-footer"><span>Showing <strong>{filteredJobs.length}</strong> of <strong>{jobs.length}</strong> demo jobs</span><button onClick={() => { setSearch(''); setStatusFilter('All statuses') }}>Clear filters <X size={13}/></button></div>

          </section>



          <footer className="page-footer"><span>© 2026 DevMesh. Built for reliable background execution.</span><span><i className="footer-status"/> All systems normal <span className="footer-sep">·</span> <button onClick={() => notify('Documentation will be available as the API is implemented')}>Documentation <ArrowUpRight size={12}/></button></span></footer>

        </div>

      </main>



      {showCreate && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>

        <form className="create-modal" onSubmit={createJob}>

          <div className="modal-header"><div><div className="modal-icon"><Plus size={19}/></div><h2>Create a job</h2><p>Submit a task to the DevMesh queue.</p></div><button type="button" className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close dialog"><X size={18}/></button></div>

          <label className="form-label">Job name<input autoFocus value={jobName} onChange={e => setJobName(e.target.value)} placeholder="e.g. Process monthly report" required maxLength={100}/></label>

          <label className="form-label">Job type<select value={jobType} onChange={e => setJobType(e.target.value)}><option value="file.process">File processing</option><option value="report.generate">Report generation</option><option value="notification.send">Send notifications</option><option value="catalog.sync">Catalog synchronization</option></select></label>

          <div className="demo-notice"><Zap size={15}/><span>This currently creates a local demo record. Real queue submission will be connected in the next milestone.</span></div>

          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="primary-button"><Plus size={15}/> Create demo job</button></div>

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
