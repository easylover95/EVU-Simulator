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
    var track_cost := int(active_job.distance) * 4
    var energy_cost := int(active_job.distance) * 3
    var crew_cost := 950 if active_job.type == "Güterverkehr" else 1400
    var operating_cost := track_cost + energy_cost + crew_cost
    balance -= operating_cost
    active_job["loco"] = loco_name
    active_job["wagon_count"] = wagon_count
    active_job["operating_cost"] = operating_cost
    active_job["status"] = "Unterwegs"
    day += 1
    balance_changed.emit(balance)
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
