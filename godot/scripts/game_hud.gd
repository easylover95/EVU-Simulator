extends Control

@onready var state: EVUGameState = get_node("/root/GameState")
@onready var balance_label: Label = $Margin/Layout/Header/Balance
@onready var day_label: Label = $Margin/Layout/Header/Day
@onready var job_title: Label = $Margin/Layout/Content/ContractPanel/Box/Title
@onready var job_details: Label = $Margin/Layout/Content/ContractPanel/Box/Details
@onready var job_status: Label = $Margin/Layout/Content/DispatchPanel/Box/Status
@onready var notification_label: Label = $Margin/Layout/Notification

func _ready() -> void:
	state.balance_changed.connect(_on_balance_changed)
	state.active_job_changed.connect(_on_active_job_changed)
	state.notification_added.connect(_on_notification_added)
	$Margin/Layout/Content/ContractPanel/Box/AcceptButton.pressed.connect(_accept_first_contract)
	$Margin/Layout/Content/DispatchPanel/Box/DispatchButton.pressed.connect(_dispatch)
	$Margin/Layout/Content/DispatchPanel/Box/CompleteButton.pressed.connect(state.complete_active_job)
	_refresh()

func _refresh() -> void:
	_on_balance_changed(state.balance)
	_on_active_job_changed(state.active_job)

func _on_balance_changed(value: int) -> void:
	balance_label.text = "Konto  %s €" % _format_number(value)
	day_label.text = "Betriebstag %d" % state.day

func _on_active_job_changed(job: Dictionary) -> void:
	if job.is_empty():
		job_title.text = "Kein aktiver Zuglauf"
		job_details.text = "Wähle einen Vertrag aus dem Baustellenmarkt."
		job_status.text = "Status: frei"
		return
	job_title.text = str(job.title)
	job_details.text = "%s · %dt · %dkm · Auszahlung %s €" % [job.cargo, job.tons, job.distance, _format_number(job.reward)]
	job_status.text = "Status: %s" % str(job.status)

func _on_notification_added(text: String) -> void:
	notification_label.text = text

func _accept_first_contract() -> void:
	if state.contracts.size() > 0:
		state.accept_contract(state.contracts[0])

func _dispatch() -> void:
	state.dispatch_active_job("V 60", 10)

func _format_number(value: int) -> String:
	return ("%d" % value).replace("000", ".000").replace("000", ".000")
