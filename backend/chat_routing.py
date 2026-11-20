"""Translate a single typed Jev decision into a bounded, browser-local action."""
from math import isfinite
from fastapi import HTTPException

# A tool name is chosen, never a URL, app ID, or executable argument from a model.
# The browser resolves app references against its live catalog.
ROUTES = {
    'dkhub_open_app': ('open', 'Explicitly navigate to or launch a registered app. Do not open for a question, recommendation or negated request.'),
    'dkhub_search_apps': ('search', 'Find apps by name, topic, category or capability. Return matches without opening.'),
    'list_all_apps': ('catalog', 'Explicitly list every registered app.'),
    'dkhub_list_favorites': ('favorites', 'List this visitor’s starred or bookmarked apps.'),
    'dkhub_list_recent': ('recent', 'List the apps this visitor last opened.'),
    'dkhub_show_library': ('library', 'Navigate back to the home page or app library.'),
    'dkhub_close_active_app': ('close_active', 'Close the current DKHub view or app window; never stop a running service.'),
    'dkhub_prepare_add_app': ('prepare_add', 'Open the form to register a website. Never install or save anything.'),
    'recommend': ('recommend', 'Ask for a personal recommendation, explanation of suitability or comparison between apps.'),
    'conversation': ('conversation', 'Ask a general question or how something works. No action requested.'),
    'clarify': ('clarify', 'Ambiguous, multiple conflicting actions, negation, or an unsupported action (install, stop, delete, modify a service).'),
}
MIN_CONFIDENCE = 0.75
CLARIFY = 'Was möchtest du im Hub tun? Du kannst z. B. eine App suchen, eine App öffnen oder deine zuletzt geöffneten Apps anzeigen.'


def jev_request(message, model):
    return {'model': model, 'state': {'message': message}, 'questions': {
        'action': {'type': 'choice',
                   'instructions': 'Which single DKHub action does this visitor request in their message? Distinguish doing something from explaining it. If unsure, choose clarify.',
                   'criteria': {action: criteria for action, (_, criteria) in ROUTES.items()}}
    }}


def decision(response):
    try:
        answer = response['answers']['action']
        choice, confidence = answer['choice'], answer['confidence']
        if (answer['type'] != 'choice' or choice not in ROUTES or type(confidence) not in (float, int)
                or not isfinite(confidence) or not 0 <= confidence <= 1):
            raise ValueError()
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(502, 'Jev hat keine gültige Werkzeugauswahl geliefert.') from exc
    return choice if confidence >= MIN_CONFIDENCE else 'clarify'


def browser_plan(choice, message):
    intent = ROUTES[choice][0]
    if intent == 'clarify':
        return {'intent': intent, 'tool': 'none', 'app_ids': [], 'reply': CLARIFY, 'engine': 'jev'}
    tool = 'dkhub_search_apps' if intent == 'catalog' else choice
    result = {'intent': intent, 'tool': tool, 'app_ids': [], 'reply': 'Der Hub kann das im geöffneten Tab ausführen.', 'engine': 'jev'}
    # Only the visitor's own words can be used as search arguments.
    if intent in {'open', 'search', 'close_active'}:
        result['query'] = message
    return result
