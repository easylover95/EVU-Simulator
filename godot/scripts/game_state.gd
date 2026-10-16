class_name EVUGameState
extends Node

signal balance_changed(value: int)
signal active_job_changed(job: Dictionary)
signal notification_added(text: String)

# Portierte Startwerte aus src/lib/seed.ts des bestehenden EVU-Simulators.
var company_name := "AixRail GmbH"
var hq_location := "Duisburg"
var balance: int = 250000
var reputation: int = 0
var level: int = 1
var day: int = 1
var active_job: Dictionary = {}

# Güterzug-Trassenpreise: 3,50 €/Zug-km plus gewichteter Zuschlag.
# Beispiel 600 t / 150 km: ca. 646 € vor Baugleis-/Prioritätszuschlägen.
const TRASSE_EUR_PER_TRAIN_KM := 3.50
const TRASSE_WEIGHT_EUR_PER_100T_KM := 0.135
const BAUGLEIS_TRASSE_FACTOR := 1.08
const DIESEL_EUR_PER_TRAIN_KM := 3.0
const ELECTRIC_EUR_PER_TRAIN_KM := 1.9

signal staff_changed
signal staff_warning(text: String)

var staff: Array[Dictionary] = [
    {"id": "tf-andreas", "name": "Andreas Fischer", "role": "Tf", "status": "verfügbar", "hours_worked": 18.0, "max_hours": 48.0, "daily_wage": 285, "qualifications": ["BR 218"]},
    {"id": "tf-juergen", "name": "Jürgen Hoffmann", "role": "Tf", "status": "verfügbar", "hours_worked": 12.0, "max_hours": 48.0, "daily_wage": 285, "qualifications": ["BR 218"]},
    {"id": "wagenpruefer-1", "name": "Marta Klein", "role": "Wagenprüfer", "status": "verfügbar", "hours_worked": 8.0, "max_hours": 40.0, "daily_wage": 220, "qualifications": ["Res", "Eanos"]},
    {"id": "azf-1", "name": "Stefan Roth", "role": "AZF/RB", "status": "verfügbar", "hours_worked": 6.0, "max_hours": 40.0, "daily_wage": 240, "qualifications": ["Baugleis"]},
]

var locomotives: Array[Dictionary] = [
    {"designation": "BR 218", "name": "218 312-7", "fuel_type": "Diesel", "status": "frei", "power_kw": 1840, "max_speed": 140},
    {"designation": "BR 218", "name": "218 389-3", "fuel_type": "Diesel", "status": "frei", "power_kw": 1840, "max_speed": 140},
]

var wagons: Array[Dictionary] = [
    {"type_code": "Res", "type_name": "Flachwagen", "capacity_t": 60, "count": 6, "status": "verfügbar"},
    {"type_code": "Eanos", "type_name": "Offener Güterwagen", "capacity_t": 61, "count": 4, "status": "verfügbar"},
]

var contracts: Array[Dictionary] = [
    {"order_number": "EVU-2026-001", "type": "Güterverkehr", "title": "Holztransport Bayreuth–Regensburg", "origin": "Bayreuth", "destination": "Regensburg", "cargo": "Schnittholz", "tons": 800, "distance": 120, "reward": 5900, "required_wagons": "4× Eanos", "deadline": "48 h"},
    {"order_number": "EVU-2026-003", "type": "Baugleis", "title": "Schottertransport Nürnberg–Ingolstadt", "origin": "Nürnberg Rbf", "destination": "Baugleis Ingolstadt", "cargo": "Schotter", "tons": 1200, "distance": 95, "reward": 10500, "required_wagons": "12× Facns", "deadline": "24 h"},
    {"order_number": "EVU-2026-005", "type": "Baugleis", "title": "Oberleitungsmaterial Würzburg–Fulda", "origin": "Würzburg Hbf", "destination": "Baugleis Fulda", "cargo": "Oberleitungsmaterial", "tons": 600, "distance": 110, "reward": 11500, "required_wagons": "8× Res", "deadline": "30 h"},
]

func calculate_track_price(order: Dictionary) -> int:
    var distance_km := float(order.get("distance", 0))
    var weight_t := float(order.get("tons", 0))
    var train_rate := TRASSE_EUR_PER_TRAIN_KM
    var weight_rate := TRASSE_WEIGHT_EUR_PER_100T_KM
    if order.get("type", "Güterverkehr") == "Baugleis":
        train_rate *= BAUGLEIS_TRASSE_FACTOR
        weight_rate *= BAUGLEIS_TRASSE_FACTOR
    var price := distance_km * train_rate + (weight_t / 100.0) * distance_km * weight_rate
    return maxi(0, roundi(price))

func calculate_energy_cost(order: Dictionary, loco_name: String) -> int:
    var rate := ELECTRIC_EUR_PER_TRAIN_KM if loco_name.contains("E") else DIESEL_EUR_PER_TRAIN_KM
    return maxi(0, roundi(float(order.get("distance", 0)) * rate))

func daily_staff_cost() -> int:
    var total := 0
    for employee in staff:
        if employee.get("status") != "gekündigt":
            total += int(employee.get("daily_wage", 0))
    return total

func available_staff(role: String, qualification: String = "") -> Array[Dictionary]:
    var result: Array[Dictionary] = []
    for employee in staff:
        var qualified: bool = qualification.is_empty() or qualification in employee.get("qualifications", [])
        if employee.get("role") == role and employee.get("status") == "verfügbar" and qualified and float(employee.get("hours_worked", 0)) < float(employee.get("max_hours", 0)):
            result.append(employee)
    return result

func can_staff_order(order: Dictionary) -> Dictionary:
    var required_tf := 2 if order.get("type") == "Baugleis" else 1
    var tf := available_staff("Tf")
    var wagon_checker := available_staff("Wagenprüfer", str(order.get("required_wagons", "")).split("× ")[-1])
    var azf := available_staff("AZF/RB", "Baugleis") if order.get("type") == "Baugleis" else []
    var ok: bool = tf.size() >= required_tf and wagon_checker.size() >= 1 and (order.get("type") != "Baugleis" or azf.size() >= 1)
    return {"ok": ok, "tf": tf, "wagenpruefer": wagon_checker, "azf": azf, "required_tf": required_tf}

func hire_staff(name: String, role: String, daily_wage: int, qualifications: Array[String]) -> bool:
    if name.strip_edges().is_empty() or daily_wage <= 0:
        return false
    staff.append({"id": "staff-%d" % Time.get_ticks_msec(), "name": name, "role": role, "status": "verfügbar", "hours_worked": 0.0, "max_hours": 40.0, "daily_wage": daily_wage, "qualifications": qualifications})
    staff_changed.emit()
    notification_added.emit("Personal eingestellt: %s (%s)" % [name, role])
    return true

func train_staff(staff_id: String, qualification: String, cost: int = 850) -> bool:
    for employee in staff:
        if employee.get("id") == staff_id and balance >= cost and qualification not in employee.get("qualifications", []):
            balance -= cost
            employee["qualifications"].append(qualification)
            employee["status"] = "verfügbar"
            balance_changed.emit(balance)
            staff_changed.emit()
            notification_added.emit("Nachschulung abgeschlossen: %s → %s" % [employee.get("name"), qualification])
            return true
    return false

func rest_staff() -> void:
    for employee in staff:
        employee["hours_worked"] = maxf(0.0, float(employee.get("hours_worked", 0)) - 8.0)
        if employee.get("status") == "Ruhezeit":
            employee["status"] = "verfügbar"
    staff_changed.emit()

func accept_contract(contract: Dictionary) -> bool:
    if not active_job.is_empty():
        notification_added.emit("Es ist bereits ein Zuglauf disponiert.")
        return false
    active_job = contract.duplicate(true)
    active_job["status"] = "Disposition offen"
    active_job_changed.emit(active_job)
    notification_added.emit("Auftrag angenommen: %s" % str(contract.title))
    return true

func dispatch_active_job(loco_name: String, wagon_count: int) -> bool:
    if active_job.is_empty():
        notification_added.emit("Kein Auftrag ausgewählt.")
        return false
    var staffing := can_staff_order(active_job)
    if not staffing.ok:
        staff_warning.emit("Personalprüfung nicht bestanden")
        notification_added.emit("Abfahrt blockiert: Tf, Wagenprüfer oder AZF/RB fehlt.")
        return false
    var track_cost := calculate_track_price(active_job)
    var energy_cost := calculate_energy_cost(active_job, loco_name)
    var crew_cost := 950 if active_job.type == "Güterverkehr" else 1400
    var operating_cost := track_cost + energy_cost + crew_cost
    if balance < operating_cost:
        notification_added.emit("Abfahrt blockiert: %d € Betriebskosten nicht gedeckt." % operating_cost)
        return false
    balance -= operating_cost
    for employee in staffing.tf:
        employee["hours_worked"] = float(employee.get("hours_worked", 0)) + 8.0
        employee["status"] = "im Einsatz"
    for employee in staffing.wagenpruefer:
        employee["hours_worked"] = float(employee.get("hours_worked", 0)) + 3.0
        employee["status"] = "im Einsatz"
    for employee in staffing.azf:
        employee["hours_worked"] = float(employee.get("hours_worked", 0)) + 4.0
        employee["status"] = "im Einsatz"
    active_job["loco"] = loco_name
    active_job["wagon_count"] = wagon_count
    active_job["track_cost"] = track_cost
    active_job["energy_cost"] = energy_cost
    active_job["crew_cost"] = crew_cost
    active_job["operating_cost"] = operating_cost
    active_job["status"] = "Unterwegs"
    day += 1
    balance_changed.emit(balance)
    staff_changed.emit()
    active_job_changed.emit(active_job)
    notification_added.emit("Zug ist fahrbereit. Kosten: %d €" % operating_cost)
    return true

func complete_active_job() -> void:
    if active_job.is_empty():
        return
    balance += int(active_job.reward)
    reputation += 1
    notification_added.emit("Auftrag abgeschlossen: +%d €" % int(active_job.reward))
    balance_changed.emit(balance)
    active_job = {}
    active_job_changed.emit(active_job)
