from flask import Blueprint, jsonify
from app.models import HardwareProfile

api_bp = Blueprint('api', __name__)


@api_bp.route('/hardware')
def get_hardware_profiles():
    profiles = HardwareProfile.query.order_by(HardwareProfile.is_default.desc()).all()
    return jsonify([p.to_dict() for p in profiles])