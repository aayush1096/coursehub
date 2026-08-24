from flask import Blueprint, render_template, request, jsonify, redirect, url_for, current_app
from flask_login import login_user, logout_user, current_user, login_required
from werkzeug.security import generate_password_hash, check_password_hash
from app.extensions import db
from app.models import User

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login')
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    client_id = current_app.config.get('GOOGLE_OAUTH_CLIENT_ID', '')
    return render_template('login.html', google_client_id=client_id)


@auth_bp.route('/register')
def register():
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    return render_template('register.html')


@auth_bp.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    identifier = data.get('identifier', '').strip()
    password = data.get('password', '')

    user = User.query.filter(
        (User.username == identifier) | (User.email == identifier)
    ).first()

    if user and user.check_password(password):
        login_user(user)
        return jsonify({'success': True, 'user': user.to_dict()})

    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401


@auth_bp.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    name = data.get('name', '').strip()

    if not username or not email or not password:
        return jsonify({'success': False, 'message': 'All fields are required'}), 400

    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400

    if User.query.filter((User.username == username) | (User.email == email)).first():
        return jsonify({'success': False, 'message': 'Username or email already in use'}), 400

    user = User(username=username, email=email, name=name or username, auth_provider='local')
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    login_user(user)
    return jsonify({'success': True, 'user': user.to_dict()})


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.login'))


@auth_bp.route('/api/google-login', methods=['POST'])
def api_google_login():
    data = request.get_json()
    credential = data.get('credential', '')

    if not credential:
        return jsonify({'success': False, 'message': 'No credential provided'}), 400

    try:
        import requests as http_req
        client_id = current_app.config.get('GOOGLE_OAUTH_CLIENT_ID', '')
        resp = http_req.get('https://oauth2.googleapis.com/tokeninfo', params={'id_token': credential}, timeout=10)
        if resp.status_code != 200:
            return jsonify({'success': False, 'message': 'Token verification failed'}), 401

        claims = resp.json()
        if claims.get('aud') != client_id:
            return jsonify({'success': False, 'message': 'Invalid audience'}), 401

        email = claims.get('email', '')
        name = claims.get('name', email.split('@')[0])
        google_id = claims.get('sub', '')
        avatar = claims.get('picture', '')

        if not email:
            return jsonify({'success': False, 'message': 'Email required'}), 400

        user = User.query.filter_by(email=email).first()
        if not user:
            username_base = email.split('@')[0]
            username = username_base
            i = 1
            while User.query.filter_by(username=username).first():
                username = f'{username_base}{i}'
                i += 1

            user = User(
                username=username,
                name=name,
                email=email,
                google_id=google_id,
                avatar=avatar,
                auth_provider='google',
                password_hash=None
            )
            db.session.add(user)
            db.session.commit()

        login_user(user)
        return jsonify({'success': True, 'user': user.to_dict()})

    except Exception as e:
        return jsonify({'success': False, 'message': 'Google login failed: ' + str(e)}), 401


@auth_bp.route('/api/user')
@login_required
def api_user():
    return jsonify(current_user.to_dict())