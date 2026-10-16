extends Node

@onready var menu: Control = $MainMenu
@onready var hud: Control = $GameHUD

func _ready() -> void:
	hud.visible = false
	menu.start_game_pressed.connect(_start_game)

func _start_game() -> void:
	menu.visible = false
	hud.visible = true
