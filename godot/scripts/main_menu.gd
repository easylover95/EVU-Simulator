extends Control

signal start_game_pressed
signal quit_pressed

func _ready() -> void:
	$Center/Panel/VBox/StartButton.pressed.connect(_on_start_pressed)
	$Center/Panel/VBox/QuitButton.pressed.connect(_on_quit_pressed)

func _on_start_pressed() -> void:
	start_game_pressed.emit()

func _on_quit_pressed() -> void:
	quit_pressed.emit()
	get_tree().quit()
